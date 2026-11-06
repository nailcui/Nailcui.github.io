/*
 * 磁力片搭建 · 3D 渲染层（基于本地 three.min.js r147，运行时零外部请求）
 *
 * TilesView.create(container, model, opts) 创建可交互视图：
 *   - 每片零件 = 边框（圆角挤出、不透明塑料 + 清漆高光）+ 中心面板（半透明、带压纹）+ 边内磁铁
 *   - 渲染顺序固定为：地面 → 全部边框（写深度）→ 全部面板（按远近排序、不写深度），避免透明穿插闪烁
 *   - 只在需要时重绘（拖动、动画、步骤变化），空闲时不占 GPU
 * TilesView.thumbnail(model, w, h) 用共享离屏渲染器生成统一视角的缩略图（dataURL，可缓存）。
 */
(function (G) {
  'use strict';
  var THREE = G.THREE, C = G.TilesCore;
  var mm = function (q) { return G.matchMedia ? G.matchMedia(q).matches : false; };
  var REDUCED = mm('(prefers-reduced-motion: reduce)');
  var COARSE = mm('(pointer: coarse)');
  var DEG = Math.PI / 180;

  // 片材尺寸（单位 = 正方形边长）
  var DIM = { thick: 0.07, gap: 0.02, frame: 0.092, bevel: 0.016, panel: 0.026 };

  if (THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  function supported() {
    if (!THREE) return false;
    try {
      var c = document.createElement('canvas');
      return !!(G.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  /* ================= 共享资源：每种片型的几何、每种颜色的材质 ================= */
  var kit = null, kitRefs = 0;

  function insetOutline(type, d) {
    var o = C.localOutline(type), ic = C.incircle(type), s = (ic.r - d) / ic.r;
    return o.map(function (p) {
      return new THREE.Vector2(ic.c[0] + (p[0] - ic.c[0]) * s, ic.c[1] + (p[1] - ic.c[1]) * s);
    });
  }

  function centerZ(geo, depth) { geo.translate(0, 0, -depth / 2); return geo; }

  function frameGeometry(type) {
    var b = DIM.bevel, depth = DIM.thick - 2 * b;
    var shape = new THREE.Shape(insetOutline(type, DIM.gap + b));
    shape.holes.push(new THREE.Path(insetOutline(type, DIM.gap + DIM.frame - b).reverse()));
    var g = new THREE.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 1
    });
    return centerZ(g, depth);
  }

  function panelGeometry(type) {
    var pts = insetOutline(type, DIM.gap + DIM.frame * 0.55);
    var g = centerZ(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: DIM.panel, bevelEnabled: false }), DIM.panel);
    // UV 改为按片型外接框归一化，压纹贴图按同一外接框绘制
    var o = C.localOutline(type), minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    o.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var pos = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
    uv.needsUpdate = true;
    return g;
  }

  // 磁铁：沿每条边埋在边框里的小磁块（合并为一个几何体）
  function magnetGeometry(type) {
    var o = C.localOutline(type), ic = C.incircle(type), parts = [];
    for (var i = 0; i < o.length; i++) {
      var a = o[i], b = o[(i + 1) % o.length];
      var ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
      var ux = ex / L, uy = ey / L;
      // 指向内心的法向
      var nx = -uy, ny = ux;
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if ((ic.c[0] - mx) * nx + (ic.c[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
      var ts = L > 1.2 ? [0.3, 0.7] : [0.27, 0.73];
      var inset = DIM.gap + DIM.frame * 0.5;
      ts.forEach(function (t) {
        var box = new THREE.BoxGeometry(0.1, 0.034, DIM.thick * 0.56).toNonIndexed();
        var m = new THREE.Matrix4().makeRotationZ(Math.atan2(uy, ux));
        m.setPosition(a[0] + ex * t + nx * inset, a[1] + ey * t + ny * inset, 0);
        box.applyMatrix4(m);
        parts.push(box);
      });
    }
    return mergeGeos(parts);
  }

  function mergeGeos(list) {
    var total = 0;
    list.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), off = 0;
    list.forEach(function (g) {
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      off += g.attributes.position.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
  }

  // 轮廓线：两个大面的外轮廓 + 角点竖线（高亮用）；中面单圈（后续轮廓用）
  function outlineGeometry(type, both) {
    var pts = insetOutline(type, DIM.gap * 0.5), arr = [], zs = both ? [DIM.thick / 2 + 0.002, -DIM.thick / 2 - 0.002] : [0];
    zs.forEach(function (z) {
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        arr.push(a.x, a.y, z, b.x, b.y, z);
      }
    });
    if (both) pts.forEach(function (p) { arr.push(p.x, p.y, zs[0], p.x, p.y, zs[1]); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }

  // 面板压纹：极淡的内圈 + 角点到中心的加强筋（真实磁力片常见的模压纹理，刻意保持低对比）
  function ribTexture(type) {
    var S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var g = cv.getContext('2d');
    var o = C.localOutline(type), ic = C.incircle(type);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    o.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    function P(x, y) { return [(x - minX) / (maxX - minX) * S, (1 - (y - minY) / (maxY - minY)) * S]; }
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    var c = P(ic.c[0], ic.c[1]);
    var rad = g.createRadialGradient(c[0], c[1], 4, c[0], c[1], S * 0.6);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(1, 'rgba(226,226,226,1)');
    g.fillStyle = rad;
    g.fillRect(0, 0, S, S);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(70,70,70,0.16)';
    g.lineWidth = 3;
    o.forEach(function (p) {
      var a = P(p[0], p[1]);
      // 筋只画到距中心一段距离，避免中心糊成一团
      var t = 0.82;
      g.beginPath();
      g.moveTo(a[0] + (c[0] - a[0]) * 0.08, a[1] + (c[1] - a[1]) * 0.08);
      g.lineTo(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t);
      g.stroke();
    });
    // 内圈细线
    var s = (ic.r - DIM.frame * 0.9) / ic.r;
    g.strokeStyle = 'rgba(70,70,70,0.13)';
    g.lineWidth = 2.5;
    g.beginPath();
    o.forEach(function (p, i) {
      var q = P(ic.c[0] + (p[0] - ic.c[0]) * s, ic.c[1] + (p[1] - ic.c[1]) * s);
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
    });
    g.closePath();
    g.stroke();
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function shade(hex, l, s) {
    var c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * (s || 1)), Math.max(0, Math.min(1, hsl.l + l)));
    return c;
  }

  function getKit() {
    kitRefs++;
    if (kit) return kit;
    kit = { geo: {}, mat: {}, tex: {} };
    C.TYPE_ORDER.forEach(function (t) {
      kit.geo[t] = {
        frame: frameGeometry(t), panel: panelGeometry(t), magnet: magnetGeometry(t),
        outline: outlineGeometry(t, true), ghost: outlineGeometry(t, false)
      };
      kit.tex[t] = ribTexture(t);
    });
    Object.keys(C.COLORS).forEach(function (k) {
      var hex = C.COLORS[k].hex;
      var frame = new THREE.MeshPhysicalMaterial({
        color: shade(hex, -0.08, 1.14), roughness: 0.36, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.28,
        envMapIntensity: 0.55, transparent: true, opacity: 0.9, depthWrite: true
      });
      var hl = frame.clone();
      hl.emissive = shade(hex, 0.12, 1.1);
      hl.emissiveIntensity = 0.32;
      kit.mat[k] = { frame: frame, hl: hl, panel: {} };
      C.TYPE_ORDER.forEach(function (t) {
        kit.mat[k].panel[t] = new THREE.MeshStandardMaterial({
          color: shade(hex, 0.02, 1.08), map: kit.tex[t], roughness: 0.2, metalness: 0,
          envMapIntensity: 0.42, transparent: true, opacity: 0.42, depthWrite: false
        });
      });
    });
    kit.magnet = new THREE.MeshStandardMaterial({ color: 0x5f6670, roughness: 0.45, metalness: 0.4 });
    kit.ghost = new THREE.LineDashedMaterial({ color: 0x8a96a3, dashSize: 0.07, gapSize: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    C.TYPE_ORDER.forEach(function (t) { kit.geo[t].ghost.computeBoundingSphere(); });
    // 虚线需要线段距离：LineSegments 在实例化后计算
    return kit;
  }

  function releaseKit() {
    kitRefs = Math.max(0, kitRefs - 1);
    if (kitRefs || !kit) return;
    C.TYPE_ORDER.forEach(function (t) {
      var g = kit.geo[t];
      Object.keys(g).forEach(function (k) { g[k].dispose(); });
      kit.tex[t].dispose();
    });
    Object.keys(kit.mat).forEach(function (k) {
      var m = kit.mat[k];
      m.frame.dispose(); m.hl.dispose();
      Object.keys(m.panel).forEach(function (t) { m.panel[t].dispose(); });
    });
    kit.magnet.dispose(); kit.ghost.dispose();
    kit = null;
  }

  /* ================= 场景：灯光、环境、地面 ================= */
  function makeEnv(renderer) {
    var pm = new THREE.PMREMGenerator(renderer);
    var env = new THREE.Scene();
    var sg = new THREE.SphereGeometry(10, 32, 16);
    var cols = [], p = sg.attributes.position, top = new THREE.Color(0xffffff), mid = new THREE.Color(0xf4ede2), bot = new THREE.Color(0xcbbfae);
    for (var i = 0; i < p.count; i++) {
      var y = p.getY(i) / 10, c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
      cols.push(c.r, c.g, c.b);
    }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    env.add(new THREE.Mesh(sg, sm));
    var pg = new THREE.PlaneGeometry(1, 1), pmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.15, 2.05), side: THREE.DoubleSide });
    [[-4, 6, 5, 6, 3], [6, 4, -2, 3, 5]].forEach(function (b) {
      var m = new THREE.Mesh(pg, pmat);
      m.position.set(b[0], b[1], b[2]);
      m.scale.set(b[3], b[4], 1);
      m.lookAt(0, 0, 0);
      env.add(m);
    });
    var rt = pm.fromScene(env, 0.035);
    sg.dispose(); sm.dispose(); pg.dispose(); pmat.dispose(); pm.dispose();
    return rt;
  }

  function aoTexture() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(92,72,48,0.16)');
    gr.addColorStop(0.55, 'rgba(92,72,48,0.06)');
    gr.addColorStop(1, 'rgba(92,72,48,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // 地面网格：间距 = 正方形边长，与造型的落地边对齐，向外渐隐
  function gridLines(model, ext) {
    var ph = function (v) { var f = v - Math.floor(v); return Math.abs(f) < 1e-3 || Math.abs(f - 1) < 1e-3 ? 0 : f; };
    var px = ph(model.box.min[0]), pz = ph(model.box.min[2]);
    var cx = (model.box.min[0] + model.box.max[0]) / 2, cz = (model.box.min[2] + model.box.max[2]) / 2;
    var pos = [], col = [], base = new THREE.Color(0xb9ab95), R = ext;
    function seg(x1, z1, x2, z2) {
      var n = 12;
      for (var i = 0; i < n; i++) {
        var t1 = i / n, t2 = (i + 1) / n;
        var ax = x1 + (x2 - x1) * t1, az = z1 + (z2 - z1) * t1, bx = x1 + (x2 - x1) * t2, bz = z1 + (z2 - z1) * t2;
        [[ax, az], [bx, bz]].forEach(function (q) {
          var d = Math.hypot(q[0] - cx, q[1] - cz) / R;
          var a = Math.max(0, 1 - d * d) * 0.55;
          pos.push(q[0], 0.001, q[1]);
          col.push(base.r, base.g, base.b, a);
        });
      }
    }
    var x0 = Math.floor(cx - R) + px, z0 = Math.floor(cz - R) + pz;
    for (var x = x0; x <= cx + R; x += 1) seg(x, cz - R, x, cz + R);
    for (var z = z0; z <= cz + R; z += 1) seg(cx - R, z, cx + R, z);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    var m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    var l = new THREE.LineSegments(g, m);
    l.renderOrder = -3;
    return l;
  }

  function pieceMatrix(p) {
    var f = p.fr, m = new THREE.Matrix4();
    m.makeBasis(new THREE.Vector3().fromArray(f.X), new THREE.Vector3().fromArray(f.Y), new THREE.Vector3().fromArray(f.Z));
    m.setPosition(f.c[0], f.c[1], f.c[2]);
    return m;
  }

  // 构建场景（视图与缩略图共用）
  function buildScene(renderer, model, k, opts) {
    var scene = new THREE.Scene();
    var box = model.box;
    var center = new THREE.Vector3((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
    var size = new THREE.Vector3(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
    var radius = size.length() / 2 + 0.15;

    var envRT = makeEnv(renderer);
    scene.environment = envRT.texture;
    scene.add(new THREE.HemisphereLight(0xfffaf2, 0xe7dccb, 0.75));
    var key = new THREE.DirectionalLight(0xfff8ee, 1.15);
    key.position.set(center.x + radius * 1.1, radius * 2.6 + 2, center.z + radius * 1.6);
    key.target.position.copy(center).setY(0);
    key.castShadow = true;
    var sm = opts.shadowSize || 2048;
    key.shadow.mapSize.set(sm, sm);
    var sc = key.shadow.camera, ext = radius * 1.25;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.1; sc.far = radius * 8 + 10;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    scene.add(key, key.target);
    var fill = new THREE.DirectionalLight(0xe9f1ff, 0.35);
    fill.position.set(center.x - radius * 2, radius, center.z - radius * 1.5);
    scene.add(fill);

    // 地面：接触阴影（只接收阴影的透明面）+ 柔和底影 + 网格
    var gsz = Math.max(size.x, size.z) + 6;
    var groundGeo = new THREE.PlaneGeometry(gsz, gsz);
    groundGeo.rotateX(-Math.PI / 2);
    var shadowMat = new THREE.ShadowMaterial({ color: 0x4a3720, opacity: 0.16, depthWrite: false });
    var ground = new THREE.Mesh(groundGeo, shadowMat);
    ground.position.set(center.x, 0, center.z);
    ground.receiveShadow = true;
    ground.renderOrder = -2;
    scene.add(ground);
    var aoTex = aoTexture(), aoGeo = new THREE.PlaneGeometry(1, 1);
    aoGeo.rotateX(-Math.PI / 2);
    var aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false });
    var ao = new THREE.Mesh(aoGeo, aoMat);
    ao.scale.set(size.x + 1.6, 1, size.z + 1.6);
    ao.position.set(center.x, 0.0005, center.z);
    ao.renderOrder = -1;
    scene.add(ao);
    var grid = opts.grid === false ? null : gridLines(model, Math.max(size.x, size.z) / 2 + 2.5);
    if (grid) scene.add(grid);

    // 零件
    var K = getKit();
    var pieces = model.pieces.map(function (p) {
      var g = new THREE.Group();
      g.matrixAutoUpdate = false;
      var base = pieceMatrix(p);
      g.matrix.copy(base);
      var geo = K.geo[p.type], mat = K.mat[p.color];
      var frame = new THREE.Mesh(geo.frame, mat.frame);
      frame.renderOrder = 1;
      frame.castShadow = true;
      var panel = new THREE.Mesh(geo.panel, mat.panel[p.type]);
      panel.renderOrder = 2;
      var mag = new THREE.Mesh(geo.magnet, K.magnet);
      g.add(mag, frame, panel);
      scene.add(g);
      return { p: p, g: g, frame: frame, base: base, ghost: null };
    });
    return {
      scene: scene, center: center, radius: radius, size: size, pieces: pieces, key: key,
      // 底影只覆盖当前已显示零件的占地范围
      fitAO: function (n) {
        var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (var i = 0; i < n; i++) model.pieces[i].pts.forEach(function (q) {
          if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
          if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2];
        });
        ao.visible = n > 0;
        if (!n) return;
        ao.scale.set(x1 - x0 + 1.4, 1, z1 - z0 + 1.4);
        ao.position.set((x0 + x1) / 2, 0.0005, (z0 + z1) / 2);
      },
      dispose: function () {
        envRT.dispose();
        groundGeo.dispose(); shadowMat.dispose();
        aoGeo.dispose(); aoMat.dispose(); aoTex.dispose();
        if (grid) { grid.geometry.dispose(); grid.material.dispose(); }
        if (key.shadow.map) key.shadow.map.dispose();
        pieces.forEach(function (o) { if (o.ghost) scene.remove(o.ghost); });
        releaseKit();
      }
    };
  }

  function camPos(center, az, el, dist) {
    return new THREE.Vector3(
      center.x + dist * Math.cos(el) * Math.sin(az),
      center.y + dist * Math.sin(el),
      center.z + dist * Math.cos(el) * Math.cos(az));
  }

  // 让整个造型（含尖顶与底座）完整落在画面里的相机距离：
  // 对全部零件角点逐一求「刚好入镜」所需距离，取给定视角集合中的最大值
  function fitDistance(model, target, views, fovDeg, aspect, margin) {
    var tv = Math.tan(fovDeg * DEG / 2), th = tv * aspect, need = 0;
    var up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), rel = new THREE.Vector3();
    var pad = DIM.thick;
    views.forEach(function (v) {
      dir.set(Math.cos(v[1]) * Math.sin(v[0]), Math.sin(v[1]), Math.cos(v[1]) * Math.cos(v[0]));
      r.crossVectors(up, dir).normalize();
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      u.crossVectors(dir, r).normalize();
      model.pieces.forEach(function (p) {
        p.pts.forEach(function (q) {
          rel.set(q[0] - target.x, q[1] - target.y, q[2] - target.z);
          var x = Math.abs(rel.dot(r)) + pad, y = Math.abs(rel.dot(u)) + pad, z = rel.dot(dir) + pad;
          need = Math.max(need, z + x / th, z + y / tv);
        });
      });
    });
    return need * (margin || 1.06);
  }
  function orbitViews(dv) {
    var out = [];
    for (var a = 0; a < 360; a += 30) { out.push([a * DEG, dv.el * DEG]); out.push([a * DEG, 52 * DEG]); }
    return out;
  }

  function makeRenderer(canvas, opts) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.06;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    return r;
  }

  var ease = {
    io: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: function (t) { var s = 1.25; t -= 1; return t * t * ((s + 1) * t + s) + 1; }
  };

  /* ================= 交互视图 ================= */
  function create(container, model, opts) {
    opts = opts || {};
    var stub = {
      ok: false, setStep: noop, setMode: noop, setGhost: noop, view: noop, zoom: noop, reset: noop,
      recommended: noop, dispose: noop, getView: function () { return null; }, setView: noop, onInteract: null
    };
    if (!supported()) { fail(container, '你的浏览器暂不支持 WebGL，无法显示 3D 模型。可以换用新版 Chrome、Safari 或 Edge 再试。'); return stub; }

    var canvas = document.createElement('canvas');
    canvas.className = 'tv-canvas';
    canvas.setAttribute('aria-label', model.name + ' 的 3D 模型，可拖动旋转、滚轮或双指缩放');
    container.appendChild(canvas);
    var renderer;
    try { renderer = makeRenderer(canvas, {}); } catch (e) {
      container.removeChild(canvas);
      fail(container, '3D 初始化失败（WebGL 不可用）。可以尝试刷新页面，或换用其他浏览器。');
      return stub;
    }
    var dprCap = COARSE ? 1.75 : 2;
    renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, dprCap));
    var S = buildScene(renderer, model, model.pieces.length, { shadowSize: COARSE ? 1024 : 2048, grid: opts.grid });
    var scene = S.scene, center = S.center.clone();
    var camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 0.05, 400);
    var dv = model.view || { az: 30, el: 24 };
    var fitViews = orbitViews(dv);
    // zoom = 相对「任意角度都完整入镜」距离的倍数。默认视角用 zoom0：在保证默认视角完整入镜的前提下尽量饱满
    // （细长造型如火车在默认角度下不必按最刁钻的角度留白）；自转展示时保持 1，转到哪个角度都不裁切
    var zoom0 = 1, touched = false;
    var st = { az: dv.az * DEG, el: dv.el * DEG, zoom: 1 };
    var fit = 10, w = 1, h = 1;

    // 高亮：当前零件的轮廓（可见部分实线 + 被遮挡部分淡线）
    var K = kit;
    var hlLine = new THREE.LineSegments(K.geo.square.outline, new THREE.LineBasicMaterial({ color: 0x0aa892, transparent: true, opacity: 0.95 }));
    var hlBehind = new THREE.LineSegments(K.geo.square.outline, new THREE.LineBasicMaterial({ color: 0x0aa892, transparent: true, opacity: 0.28, depthTest: false }));
    [hlLine, hlBehind].forEach(function (l) { l.matrixAutoUpdate = false; l.visible = false; l.renderOrder = 5; scene.add(l); });

    var state = { upto: model.pieces.length, mode: 'full', ghost: false };
    var anim = null;        // 当前零件吸附动画
    var tween = null;       // 相机过渡
    var pulseUntil = 0;
    var needs = true, raf = 0, last = 0, alive = true;
    var auto = !!opts.autoRotate && !REDUCED, autoPauseUntil = 0;
    var visible = true;

    var paused = false, watchdog = 0;

    function resize() {
      var r = container.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      w = Math.round(r.width); h = Math.round(r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fit = fitDistance(model, center, fitViews, camera.fov, camera.aspect, opts.margin || 1.05);
      if (!opts.autoRotate) {
        var own = fitDistance(model, center, [[dv.az * DEG, dv.el * DEG]], camera.fov, camera.aspect, (opts.margin || 1.05) * 1.04);
        zoom0 = Math.min(1, Math.max(0.82, own / fit));
      }
      if (!touched) st.zoom = zoom0;
      invalidate();
    }

    function applyCamera() {
      camera.position.copy(camPos(center, st.az, st.el, fit * st.zoom));
      camera.lookAt(center);
    }

    function invalidate() {
      needs = true;
      kick();
    }
    // 个别内嵌/省电环境会把 rAF 整体挂起：页面可见时 250ms 没跑起来就改用定时器驱动
    function kick() {
      if (!alive || paused) return;
      if (!raf) raf = requestAnimationFrame(frame);
      // 即使已有挂起的 rAF 也要重新布防：避免一次被跳过后，后续重绘请求全部石沉大海
      if (!watchdog) watchdog = setTimeout(function dog() {
        watchdog = 0;
        if (!raf || !alive || paused) return;
        if (document.visibilityState === 'visible') {
          cancelAnimationFrame(raf);
          raf = 0;
          last = 0;
          frame(performance.now());
        } else {
          // 页面暂时不可见：稍后再看（真实浏览器里可见后 rAF 会先到，这里不会重复绘制）
          watchdog = setTimeout(dog, 600);
        }
      }, 250);
    }

    function frame(t) {
      raf = 0;
      if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
      if (!alive || paused) { last = 0; return; }
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      last = t;
      var more = false;
      if (tween) {
        var k = Math.min(1, (t - tween.t0) / tween.dur), e = ease.io(k);
        st.az = tween.a0 + (tween.a1 - tween.a0) * e;
        st.el = tween.e0 + (tween.e1 - tween.e0) * e;
        st.zoom = tween.z0 + (tween.z1 - tween.z0) * e;
        if (k >= 1) tween = null; else more = true;
      }
      if (inertia && !drag) {
        st.az += inertia.az; st.el = clampEl(st.el + inertia.el);
        inertia.az *= 0.9; inertia.el *= 0.9;
        if (Math.abs(inertia.az) + Math.abs(inertia.el) < 0.0004) inertia = null; else more = true;
      }
      if (auto && visible && !drag && !tween && t > autoPauseUntil) { st.az += dt * 0.22; more = true; }
      if (anim) {
        var ak = Math.min(1, (t - anim.t0) / anim.dur);
        var off = anim.off.clone().multiplyScalar(1 - ease.back(ak));
        anim.o.g.matrix.copy(anim.o.base).premultiply(new THREE.Matrix4().makeTranslation(off.x, off.y, off.z));
        syncHL();
        if (ak >= 1) { anim.o.g.matrix.copy(anim.o.base); syncHL(); anim = null; } else more = true;
      }
      if (pulseUntil) {
        var cur = currentObj();
        if (cur && t < pulseUntil) {
          var ph = (pulseUntil - t) / 1800;
          cur.frame.material.emissiveIntensity = 0.3 + 0.35 * Math.sin(ph * Math.PI * 3) * ph;
          more = true;
        } else {
          if (cur) cur.frame.material.emissiveIntensity = 0.3;
          pulseUntil = 0;
        }
      }
      if (needs || more) {
        applyCamera();
        renderer.render(scene, camera);
        needs = false;
      }
      if (more) kick();
      else last = 0;
    }

    function currentObj() {
      if (state.mode !== 'steps' || state.upto < 1) return null;
      return S.pieces[state.upto - 1];
    }

    function syncHL() {
      var cur = currentObj();
      var show = !!cur;
      hlLine.visible = hlBehind.visible = show;
      if (!show) return;
      var g = K.geo[cur.p.type].outline;
      hlLine.geometry = hlBehind.geometry = g;
      hlLine.matrix.copy(cur.g.matrix);
      hlBehind.matrix.copy(cur.g.matrix);
    }

    function ensureGhost(o) {
      if (o.ghost) return o.ghost;
      var l = new THREE.LineSegments(K.geo[o.p.type].ghost, K.ghost);
      l.computeLineDistances();
      l.matrixAutoUpdate = false;
      l.matrix.copy(o.base);
      l.renderOrder = 0;
      scene.add(l);
      o.ghost = l;
      return l;
    }

    function applyState(animate, prev) {
      var full = state.mode === 'full';
      var n = full ? S.pieces.length : state.upto;
      S.pieces.forEach(function (o, i) {
        o.g.visible = i < n;
        o.frame.material = K.mat[o.p.color].frame;
        o.g.matrix.copy(o.base);
        var showGhost = !full && state.ghost && i >= n;
        if (showGhost) ensureGhost(o).visible = true;
        else if (o.ghost) o.ghost.visible = false;
      });
      anim = null;
      S.fitAO(n);
      var cur = currentObj();
      if (cur) {
        cur.frame.material = K.mat[cur.p.color].hl;
        cur.frame.material.emissiveIntensity = 0.3;
        if (animate && !REDUCED && prev === state.upto - 1) {
          // 从外侧上方滑入并「吸」到位
          var dir = new THREE.Vector3(cur.p.fr.c[0] - S.center.x, 0, cur.p.fr.c[2] - S.center.z);
          if (dir.lengthSq() < 0.01) dir.fromArray(cur.p.fr.Z).setY(0);
          if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
          dir.normalize().multiplyScalar(0.55).add(new THREE.Vector3(0, 0.75, 0)).normalize().multiplyScalar(0.85);
          anim = { o: cur, off: dir, t0: performance.now(), dur: 420 };
          pulseUntil = performance.now() + 1800;
        } else pulseUntil = 0;
      }
      syncHL();
      invalidate();
    }

    /* ---------- 指针：单指/左键旋转，双指捏合缩放，滚轮缩放 ---------- */
    var pts = new Map(), drag = null, pinch = null, inertia = null;
    function clampEl(e) { return Math.max(4 * DEG, Math.min(86 * DEG, e)); }
    function clampZoom(z) { return Math.max(0.38, Math.min(2.6, z)); }
    function interacted() {
      tween = null;
      touched = true;
      autoPauseUntil = performance.now() + 5000;
      if (api.onInteract) api.onInteract();
    }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 指针捕获失败（例如指针已失效）不能影响后续手势识别
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      inertia = null;
      interacted();
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now() };
      else if (pts.size === 2) {
        drag = null;
        var a = Array.from(pts.values());
        pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z: st.zoom };
      }
    }
    function onMove(e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        var a = Array.from(pts.values());
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
        st.zoom = clampZoom(pinch.z * pinch.d / d);
        invalidate();
      } else if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
        // 灵敏度随画布尺寸缩放：手机上横扫满屏约转 220°，桌面约 180°
        var sp = 4.2 / Math.max(320, Math.min(w, h) * 1.5);
        st.az -= dx * sp * 1.3;
        st.el = clampEl(st.el + dy * sp);
        var dtm = Math.max(1, now - drag.t), cap = 0.06;
        drag.vx = Math.max(-cap, Math.min(cap, -dx * sp * 1.3 * 16 / dtm));
        drag.vy = Math.max(-cap, Math.min(cap, dy * sp * 16 / dtm));
        drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
        invalidate();
      }
    }
    function onUp(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && pts.size === 0) {
        if (!REDUCED && performance.now() - drag.t < 80) { inertia = { az: drag.vx, el: drag.vy }; invalidate(); }
        drag = null;
      } else if (pts.size === 1) {
        var p = Array.from(pts.values())[0];
        drag = { x: p.x, y: p.y, vx: 0, vy: 0, t: performance.now() };
      }
    }
    function onWheel(e) {
      e.preventDefault();
      interacted();
      st.zoom = clampZoom(st.zoom * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
      invalidate();
    }
    function onDbl() { api.reset(); }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      fail(container, '3D 显示被系统中断了，请刷新页面重试。');
    });

    var ro = G.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else G.addEventListener('resize', resize);
    var io = G.IntersectionObserver ? new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible) invalidate();
    }) : null;
    if (io) io.observe(container);
    function onVis() { if (!document.hidden) invalidate(); }
    document.addEventListener('visibilitychange', onVis);

    function tweenTo(az, el, zoom, dur) {
      var a0 = st.az;
      // 走最短的方位角路径
      var d = ((az - a0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (REDUCED || dur === 0) { st.az = a0 + d; st.el = clampEl(el); st.zoom = clampZoom(zoom); invalidate(); return; }
      tween = { t0: performance.now(), dur: dur || 650, a0: a0, a1: a0 + d, e0: st.el, e1: clampEl(el), z0: st.zoom, z1: clampZoom(zoom) };
      invalidate();
    }

    var api = {
      ok: true, onInteract: null,
      // 一次性设置 { mode, upto, ghost }，避免多次重建可见性
      set: function (o, animate) {
        var prev = state.upto;
        if (o.mode) state.mode = o.mode;
        if (o.ghost != null) state.ghost = !!o.ghost;
        if (o.upto != null) state.upto = Math.max(0, Math.min(model.pieces.length, o.upto));
        applyState(animate, prev);
      },
      setStep: function (k, animate) {
        var prev = state.upto;
        state.upto = Math.max(0, Math.min(model.pieces.length, k));
        applyState(animate, prev);
      },
      setMode: function (m) { state.mode = m; applyState(false); },
      setGhost: function (b) { state.ghost = !!b; applyState(false); },
      view: function (name) {
        var V = { front: [0, 10], side: [90, 10], top: [0, 86], iso: [dv.az, dv.el] }[name] || [dv.az, dv.el];
        interacted();
        tweenTo(V[0] * DEG, V[1] * DEG, name === 'top' ? 0.95 : 1, 650);
      },
      recommended: function (v) {
        interacted();
        v = v || dv;
        tweenTo(v.az * DEG, v.el * DEG, v === dv ? zoom0 : (v.zoom || 1), 700);
      },
      zoom: function (dir) { interacted(); tweenTo(st.az, st.el, st.zoom * (dir > 0 ? 0.8 : 1.25), 260); },
      reset: function () { interacted(); tweenTo(dv.az * DEG, dv.el * DEG, zoom0, 600); },
      getView: function () { return { az: st.az / DEG, el: st.el / DEG, zoom: st.zoom }; },
      setView: function (v) { if (v) { st.az = v.az * DEG; st.el = clampEl(v.el * DEG); st.zoom = clampZoom(v.zoom || 1); invalidate(); } },
      setAutoRotate: function (b) { auto = !!b && !REDUCED; invalidate(); },
      dispose: function () {
        if (!alive) return;
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        if (watchdog) clearTimeout(watchdog);
        if (ro) ro.disconnect(); else G.removeEventListener('resize', resize);
        if (io) io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        G.removeEventListener('pagehide', onHide);
        G.removeEventListener('pageshow', onShow);
        hlLine.material.dispose(); hlBehind.material.dispose();
        S.dispose();
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
    // 离开页面：进入往返缓存时只暂停，真正卸载时释放 GPU 资源
    function onHide(e) {
      if (e.persisted) { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      else api.dispose();
    }
    function onShow(e) { if (e.persisted) { paused = false; invalidate(); } }
    G.addEventListener('pagehide', onHide);
    G.addEventListener('pageshow', onShow);

    resize();
    applyState(false);
    // 首帧同步绘制，不依赖 rAF 何时恢复
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    frame(performance.now());
    if (opts.onReady) setTimeout(opts.onReady, 0);
    return api;
  }

  function noop() {}
  function fail(container, msg) {
    var d = document.createElement('div');
    d.className = 'tv-fail';
    d.innerHTML = '<div class="tv-fail-ico">🧩</div><p>' + C.esc(msg) + '</p>';
    container.appendChild(d);
    var ld = container.querySelector('.tv-loading');
    if (ld) ld.remove();
  }

  /* ================= 缩略图：统一视角离屏渲染 + 本地缓存 ================= */
  var thumbR = null, thumbTimer = 0;
  function thumbnail(model, w, h) {
    var key = 'tiles:thumb:' + model.id + ':' + model.hash + ':' + w + 'x' + h;
    try { var hit = localStorage.getItem(key); if (hit) return hit; } catch (e) { /* 忽略 */ }
    if (!supported()) return null;
    try {
      if (!thumbR) {
        thumbR = makeRenderer(document.createElement('canvas'), { preserve: true });
        thumbR.setPixelRatio(1);
      }
      thumbR.setSize(w, h, false);
      var S = buildScene(thumbR, model, model.pieces.length, { shadowSize: 1024, grid: true });
      var cam = new THREE.PerspectiveCamera(28, w / h, 0.05, 400);
      var c = S.center.clone();
      var v = model.view || { az: 30, el: 24 }, az = v.az * DEG, el = (v.el + 4) * DEG;
      cam.position.copy(camPos(c, az, el, fitDistance(model, c, [[az, el]], 28, w / h, 1.1)));
      cam.lookAt(c);
      thumbR.render(S.scene, cam);
      var fmt = 'image/webp', url = thumbR.domElement.toDataURL(fmt, 0.9);
      if (url.indexOf('data:image/webp') !== 0) url = thumbR.domElement.toDataURL('image/png');
      S.dispose();
      try {
        // 清掉同一造型的旧缓存
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf('tiles:thumb:' + model.id + ':') === 0 && k !== key) localStorage.removeItem(k);
        }
        localStorage.setItem(key, url);
      } catch (e) { /* 存储满了也不影响展示 */ }
      clearTimeout(thumbTimer);
      thumbTimer = setTimeout(function () {
        if (thumbR) { thumbR.dispose(); thumbR.forceContextLoss && thumbR.forceContextLoss(); thumbR = null; }
      }, 1500);
      return url;
    } catch (e) {
      return null;
    }
  }

  G.TilesView = { create: create, thumbnail: thumbnail, supported: supported, REDUCED: REDUCED, COARSE: COARSE, DIM: DIM };
})(window);
