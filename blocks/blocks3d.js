/*
 * 阿基米德积木 · 3D 渲染层（基于本地 three.min.js r147，运行时零外部请求）
 *
 * BlocksView.create(container, model, opts) 创建可交互视图：
 *   - 全部木条合入一个 InstancedMesh（共享一份倒角长方体几何 + 一份程序化木纹材质），
 *     阶段显隐用零缩放矩阵实现；每根木条通过 instanceColor 做轻微色差、aGrain 做木纹错位
 *   - 「关键阶段」新增木条由第二个 InstancedMesh 覆盖一层陶土色半透明高亮：切换阶段时短暂加强后
 *     稳定在一个很淡的常驻着色（prefers-reduced-motion 时无脉冲动画）
 *   - 只在需要时重绘（拖动、动画、阶段变化）；内嵌/省电环境 rAF 被挂起时由定时器兜底
 *   - 默认不自动旋转，可由页面开启；切换阶段保留用户视角
 * BlocksView.thumbnail(model, w, h) 用共享离屏渲染器生成统一视角缩略图（dataURL，可缓存）。
 */
(function (G) {
  'use strict';
  var THREE = G.THREE, C = G.BlocksCore, SPEC = C.SPEC;
  var mm = function (q) { return G.matchMedia ? G.matchMedia(q).matches : false; };
  var REDUCED = mm('(prefers-reduced-motion: reduce)');
  var COARSE = mm('(pointer: coarse)');
  var DEG = Math.PI / 180;
  var CH = 0.06;            // 倒角尺寸（单位 = 厚度 8mm，约 0.5mm）
  var MAX_INST = 1024;      // aGrain 实例属性容量（所有作品都远小于此）
  var HL_SCALE = new THREE.Vector3(1.02, 1.02, 1.02);

  if (THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  function supported() {
    if (!THREE) return false;
    try {
      var c = document.createElement('canvas');
      return !!(G.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  /* ================= 倒角长方体几何（局部：X=长 15、Y=厚 1、Z=宽 3，含木纹 UV 分区） ================= */
  // UV 分区：纹理 u 方向 = 顺纹方向，1.0 = 15 单位长；v 方向总高 5.625 单位
  var UV = { big: 0.02, side: 0.585, endU: 0.03, endV: 0.79, SV: 1 / 5.625, SU: 1 / SPEC.L };

  function stickGeometry() {
    var L = SPEC.L, T = SPEC.T, W = SPEC.W, c = CH;
    var H = [L / 2, T / 2, W / 2];
    var pos = [], nor = [], uvs = [], idx = [];

    function mapUV(axis, p) {
      if (axis === 1) return [(p[0] + H[0]) * UV.SU, UV.big + (p[2] + H[2]) * UV.SV];      // 大面 15×3
      if (axis === 2) return [(p[0] + H[0]) * UV.SU, UV.side + (p[1] + H[1]) * UV.SV];     // 窄长面 15×1
      return [UV.endU + (p[2] + H[2]) * UV.SU, UV.endV + (p[1] + H[1]) * UV.SV];           // 端面 3×1
    }
    function add(p, n, axis) {
      var t = mapUV(axis, p);
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uvs.push(t[0], t[1]);
      return pos.length / 3 - 1;
    }
    function P(a, va, b, vb, cc, vc) { var p = [0, 0, 0]; p[a] = va; p[b] = vb; p[cc] = vc; return p; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function norm3(a, b, c3) { var l = Math.hypot(a, b, c3) || 1; return [a / l, b / l, c3 / l]; }

    // 六个大面（内缩 c；循环序 (a, a+1, a+2) 保证 e_{a+1} × e_{a+2} = e_a，外向 CCW）
    for (var a = 0; a < 3; a++) for (var s = -1; s <= 1; s += 2) {
      var b = (a + 1) % 3, cc = (a + 2) % 3;
      var n = [0, 0, 0]; n[a] = s;
      var q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      if (s < 0) q.reverse();
      var ids = q.map(function (t) {
        return add(P(a, s * H[a], b, t[0] * (H[b] - c), cc, t[1] * (H[cc] - c)), n, a);
      });
      idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
    // 十二条倒角棱（法向 = 相邻两面外向之和）
    for (a = 0; a < 3; a++) for (var b2 = a + 1; b2 < 3; b2++) {
      var w = 3 - a - b2;
      for (var sa = -1; sa <= 1; sa += 2) for (var sb = -1; sb <= 1; sb += 2) {
        var na = [0, 0, 0], nb = [0, 0, 0];
        na[a] = sa; nb[b2] = sb;
        var n2 = norm3(na[0] + nb[0], na[1] + nb[1], na[2] + nb[2]);
        var pa0 = P(a, sa * H[a], b2, sb * (H[b2] - c), w, -(H[w] - c));
        var pa1 = P(a, sa * H[a], b2, sb * (H[b2] - c), w, (H[w] - c));
        var pb1 = P(b2, sb * H[b2], a, sa * (H[a] - c), w, (H[w] - c));
        var pb0 = P(b2, sb * H[b2], a, sa * (H[a] - c), w, -(H[w] - c));
        var i0 = add(pa0, n2, a), i1 = add(pa1, n2, a), i2 = add(pb1, n2, b2), i3 = add(pb0, n2, b2);
        if (dot(cross(sub(pa1, pa0), sub(pb1, pa0)), n2) > 0) idx.push(i0, i1, i2, i0, i2, i3);
        else idx.push(i0, i3, i2, i0, i2, i1);
      }
    }
    // 八个倒角角
    for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) for (var sz = -1; sz <= 1; sz += 2) {
      var n3 = norm3(sx, sy, sz);
      var px = [sx * H[0], sy * (H[1] - c), sz * (H[2] - c)];
      var py = [sx * (H[0] - c), sy * H[1], sz * (H[2] - c)];
      var pz = [sx * (H[0] - c), sy * (H[1] - c), sz * H[2]];
      var j0 = add(px, n3, 0), j1 = add(py, n3, 1), j2 = add(pz, n3, 2);
      if (dot(cross(sub(py, px), sub(pz, px)), n3) > 0) idx.push(j0, j1, j2);
      else idx.push(j0, j2, j1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }

  /* ================= 程序化木纹（顺纹低对比；v 末段为端面纹理带） ================= */
  function prng(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function woodTexture() {
    var W = 1024, H = 384, GRAIN_END = 0.76;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var rnd = prng(20261107);
    g.fillStyle = '#dfc6a4';                       // 浅色天然木基调
    g.fillRect(0, 0, W, H);
    // 早材 / 晚材宽幅色带（水平走向，u 向无缝）
    for (var i = 0; i < 14; i++) {
      var y0 = rnd() * H * GRAIN_END, hh = 6 + rnd() * 26;
      g.fillStyle = 'rgba(' + (rnd() > 0.45 ? '170,132,92' : '244,230,206') + ',' + (0.035 + rnd() * 0.05).toFixed(3) + ')';
      g.fillRect(0, y0, W, hh);
    }
    // 细顺纹：u 方向用整数周期正弦叠加，保证左右无缝
    g.lineCap = 'round';
    for (i = 0; i < 240; i++) {
      var y = rnd() * H * GRAIN_END;
      var amp = 0.8 + rnd() * 2.6, k1 = 1 + Math.floor(rnd() * 4), k2 = 5 + Math.floor(rnd() * 9);
      var ph1 = rnd() * Math.PI * 2, ph2 = rnd() * Math.PI * 2;
      var dark = rnd() > 0.32;
      g.strokeStyle = dark
        ? 'rgba(' + (150 + Math.floor(rnd() * 30)) + ',' + (112 + Math.floor(rnd() * 22)) + ',72,' + (0.05 + rnd() * 0.085).toFixed(3) + ')'
        : 'rgba(246,233,210,' + (0.05 + rnd() * 0.06).toFixed(3) + ')';
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      for (var x = 0; x <= W; x += 12) {
        var yy = y + Math.sin(x / W * Math.PI * 2 * k1 + ph1) * amp + Math.sin(x / W * Math.PI * 2 * k2 + ph2) * amp * 0.35;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // 细微噪点
    for (i = 0; i < 5200; i++) {
      var px = rnd() * W, py = rnd() * H * GRAIN_END;
      g.fillStyle = 'rgba(' + (rnd() > 0.5 ? '120,90,58' : '248,238,218') + ',0.028)';
      g.fillRect(px, py, 1 + rnd() * 1.6, 1);
    }
    // 端面带（横截面观感）：底色略深 + 细密短纹 + 极淡的年轮弧
    var ey = H * GRAIN_END;
    g.fillStyle = '#d3b78f';
    g.fillRect(0, ey, W, H - ey);
    for (i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(160,124,84,' + (0.05 + rnd() * 0.06).toFixed(3) + ')';
      g.fillRect(0, ey + rnd() * (H - ey), W, 2 + rnd() * 8);
    }
    for (i = 0; i < 2600; i++) {
      var qx = rnd() * W, qy = ey + rnd() * (H - ey);
      g.strokeStyle = rnd() > 0.5 ? 'rgba(140,106,70,0.07)' : 'rgba(240,226,200,0.07)';
      g.lineWidth = 0.8 + rnd();
      g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx, qy + 1.6 + rnd() * 2.4); g.stroke();
    }
    var cx = W * 0.5, cy = H + 40;
    for (i = 0; i < 26; i++) {
      g.strokeStyle = 'rgba(158,120,80,' + (0.03 + rnd() * 0.045).toFixed(3) + ')';
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      g.arc(cx, cy, 60 + i * (7 + rnd() * 6), Math.PI * 1.02, Math.PI * 1.98);
      g.stroke();
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  /* ================= 共享资源：几何 / 木纹 / 材质（可跨渲染器复用；环境贴图不共享） ================= */
  var kit = null, kitRefs = 0;
  function getKit() {
    kitRefs++;
    if (kit) return kit;
    var geo = stickGeometry();
    // 每实例木纹错位（u 顺纹方向随机平移 + 极小 v 平移），避免所有木条纹理一模一样
    var arr = new Float32Array(MAX_INST * 2), r = prng(777);
    for (var i = 0; i < MAX_INST; i++) { arr[i * 2] = r(); arr[i * 2 + 1] = r() * 0.03; }
    geo.setAttribute('aGrain', new THREE.InstancedBufferAttribute(arr, 2));

    var tex = woodTexture();
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.74, metalness: 0, envMapIntensity: 0.42 });
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aGrain;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv += aGrain;\n#endif');
    };
    mat.customProgramCacheKey = function () { return 'blk-grain'; };
    var hl = new THREE.MeshBasicMaterial({ color: 0xd9763f, transparent: true, opacity: 0, depthWrite: false });
    kit = { geo: geo, tex: tex, mat: mat, hl: hl };
    return kit;
  }
  function releaseKit() {
    kitRefs = Math.max(0, kitRefs - 1);
    if (kitRefs || !kit) return;
    kit.geo.dispose(); kit.tex.dispose(); kit.mat.dispose(); kit.hl.dispose();
    kit = null;
  }

  // 程序化环境：暖白天空 + 地面反照 + 两块柔光板，给哑光木面一点柔和反射
  // 注意：PMREM 渲染目标与 WebGL 上下文绑定，只能由创建它的渲染器使用，因此每个场景独立生成
  function makeEnv(renderer) {
    var pm = new THREE.PMREMGenerator(renderer);
    var env = new THREE.Scene();
    var sg = new THREE.SphereGeometry(10, 32, 16);
    var cols = [], p = sg.attributes.position;
    var top = new THREE.Color(0xffffff), mid = new THREE.Color(0xf6efe3), bot = new THREE.Color(0xcfc0aa);
    for (var i = 0; i < p.count; i++) {
      var y = p.getY(i) / 10, c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
      cols.push(c.r, c.g, c.b);
    }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    env.add(new THREE.Mesh(sg, sm));
    var pg = new THREE.PlaneGeometry(1, 1);
    var pmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 2.02, 1.9), side: THREE.DoubleSide });
    [[-4, 6, 5, 6, 3], [6, 4, -2, 3, 5]].forEach(function (b) {
      var m = new THREE.Mesh(pg, pmat);
      m.position.set(b[0], b[1], b[2]); m.scale.set(b[3], b[4], 1); m.lookAt(0, 0, 0);
      env.add(m);
    });
    var rt = pm.fromScene(env, 0.04);
    sg.dispose(); sm.dispose(); pg.dispose(); pmat.dispose(); pm.dispose();
    return rt;
  }

  // 桌面柔影贴图（接触感）
  function aoTexture() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(96,74,46,0.14)');
    gr.addColorStop(0.55, 'rgba(96,74,46,0.05)');
    gr.addColorStop(1, 'rgba(96,74,46,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ================= 实例矩阵 / 颜色 ================= */
  var M4Y = null, M4X = null;
  function stickMatrix(s, out) {
    if (!M4Y) { M4Y = new THREE.Matrix4().makeRotationY(Math.PI / 2); M4X = new THREE.Matrix4().makeRotationX(Math.PI / 2); }
    out.makeRotationY(s.d === 'z' ? Math.PI / 2 : 0);
    if (s.e) out.multiply(M4X);
    out.setPosition(s.x, s.y, s.z);
    return out;
  }
  function tintAt(i, out) {
    var br = 0.94 + prng(1000 + i * 131)() * 0.12;
    var r1 = prng(7000 + i * 17)(), r2 = prng(9000 + i * 29)();
    out.setRGB(Math.min(1, br * (0.985 + r1 * 0.03)), Math.min(1, br * (0.985 - r1 * 0.02)), Math.min(1, br * (0.98 - r2 * 0.04)));
    return out;
  }

  /* ================= 场景（视图与缩略图共用） ================= */
  function buildScene(renderer, model, opts) {
    opts = opts || {};
    var K = getKit();
    var scene = new THREE.Scene();
    var box = model.box;
    var center = new THREE.Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
    var size = new THREE.Vector3(model.dims.x, model.dims.y, model.dims.z);
    var radius = size.length() / 2 + 0.2;

    var envRT = makeEnv(renderer);
    scene.environment = envRT.texture;
    scene.add(new THREE.HemisphereLight(0xfff7ea, 0xd8c9b2, 0.62));
    var key = new THREE.DirectionalLight(0xfff4e4, 1.28);
    key.position.set(center.x + radius * 1.15, radius * 2.3 + 3, center.z + radius * 1.5);
    key.target.position.copy(center).setY(0);
    key.castShadow = true;
    var sm = opts.shadowSize || 2048;
    key.shadow.mapSize.set(sm, sm);
    var sc = key.shadow.camera, ext = radius * 1.3;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.1; sc.far = radius * 8 + 12;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    var fill = new THREE.DirectionalLight(0xdfe9ff, 0.34);
    fill.position.set(center.x - radius * 2, radius * 1.1, center.z - radius * 1.6);
    scene.add(fill);

    // 桌面：只接收阴影的透明面 + 随已显示木条占地缩放的柔影
    var gsz = Math.max(size.x, size.z) + 8;
    var groundGeo = new THREE.PlaneGeometry(gsz, gsz);
    groundGeo.rotateX(-Math.PI / 2);
    var groundMat = new THREE.ShadowMaterial({ color: 0x40301a, opacity: 0.2, depthWrite: false });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(center.x, 0, center.z);
    ground.receiveShadow = true;
    ground.renderOrder = -2;
    scene.add(ground);
    var aoTex = aoTexture(), aoGeo = new THREE.PlaneGeometry(1, 1);
    aoGeo.rotateX(-Math.PI / 2);
    var aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false });
    var ao = new THREE.Mesh(aoGeo, aoMat);
    ao.position.set(center.x, 0.0004, center.z);
    ao.renderOrder = -1;
    scene.add(ao);

    // 木条：一个 InstancedMesh 装下全部；高亮层为第二个 InstancedMesh（放大 1.02 包住木条）
    var N = model.sticks.length;
    var inst = new THREE.InstancedMesh(K.geo, K.mat, N);
    inst.castShadow = inst.receiveShadow = true;
    inst.frustumCulled = false;
    var hl = new THREE.InstancedMesh(K.geo, K.hl, N);
    hl.frustumCulled = false;
    hl.renderOrder = 10;
    scene.add(inst, hl);

    var baseM = [], tmpM = new THREE.Matrix4(), zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    var tint = [], faded = [], col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
    for (var i = 0; i < N; i++) {
      baseM.push(stickMatrix(model.sticks[i], new THREE.Matrix4()));
      inst.setMatrixAt(i, baseM[i]);
      tintAt(i, col);
      tint.push(col.clone());
      var f = col.clone();
      f.multiplyScalar(0.82);
      f.getHSL(hsl);
      f.setHSL(hsl.h, hsl.s * 0.55, hsl.l);
      faded.push(f);
      inst.setColorAt(i, tint[i]);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

    var pts = [];
    model.sticks.forEach(function (s) {
      C.corners(s.box).forEach(function (q) { pts.push(q); });
    });

    function fitAO(n) {
      if (!n) { ao.visible = false; return; }
      var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (var i2 = 0; i2 < n; i2++) {
        var b = model.sticks[i2].box;
        if (b.x0 < x0) x0 = b.x0; if (b.x1 > x1) x1 = b.x1;
        if (b.z0 < z0) z0 = b.z0; if (b.z1 > z1) z1 = b.z1;
      }
      ao.visible = true;
      ao.scale.set(x1 - x0 + 1.6, 1, z1 - z0 + 1.6);
      ao.position.set((x0 + x1) / 2, 0.0004, (z0 + z1) / 2);
    }

    return {
      scene: scene, center: center, radius: radius, pts: pts, inst: inst, hl: hl, hlMat: K.hl,
      // n：可见木条数；hlFrom/hlTo：高亮区间；fade：淡化高亮区间之前的旧木条
      apply: function (n, hlFrom, hlTo, fade) {
        for (var i2 = 0; i2 < N; i2++) {
          var vis = i2 < n;
          inst.setMatrixAt(i2, vis ? baseM[i2] : zeroM);
          inst.setColorAt(i2, vis && fade && i2 < hlFrom ? faded[i2] : tint[i2]);
          var inHl = vis && hlTo > hlFrom && i2 >= hlFrom && i2 < hlTo;
          hl.setMatrixAt(i2, inHl ? tmpM.copy(baseM[i2]).scale(HL_SCALE) : zeroM);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        hl.instanceMatrix.needsUpdate = true;
        fitAO(n);
      },
      dispose: function () {
        envRT.dispose();
        groundGeo.dispose(); groundMat.dispose();
        aoGeo.dispose(); aoMat.dispose(); aoTex.dispose();
        if (key.shadow.map) key.shadow.map.dispose();
        releaseKit();
      }
    };
  }

  /* ================= 相机 ================= */
  function camPos(target, az, el, dist) {
    return new THREE.Vector3(
      target.x + dist * Math.cos(el) * Math.sin(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.cos(az));
  }
  // 一组视角下「刚好完整入镜」的距离（对全部角点逐一求解取最大）
  function fitDistance(pts, target, views, fovDeg, aspect, margin) {
    var tv = Math.tan(fovDeg * DEG / 2), th = tv * aspect, need = 0;
    var up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), rel = new THREE.Vector3();
    var pad = 0.4;
    views.forEach(function (v) {
      dir.set(Math.cos(v[1]) * Math.sin(v[0]), Math.sin(v[1]), Math.cos(v[1]) * Math.cos(v[0]));
      r.crossVectors(up, dir).normalize();
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      u.crossVectors(dir, r).normalize();
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i];
        rel.set(q[0] - target.x, q[1] - target.y, q[2] - target.z);
        var x = Math.abs(rel.dot(r)) + pad, y = Math.abs(rel.dot(u)) + pad, z = rel.dot(dir) + pad;
        need = Math.max(need, z + x / th, z + y / tv);
      }
    });
    return need * (margin || 1.06);
  }
  function orbitViews(elDeg) {
    var out = [];
    for (var a = 0; a < 360; a += 30) { out.push([a * DEG, elDeg * DEG]); out.push([a * DEG, 50 * DEG]); }
    return out;
  }

  function makeRenderer(canvas) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    return r;
  }

  var ease = {
    io: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); }
  };

  /* ================= 交互视图 ================= */
  function create(container, model, opts) {
    opts = opts || {};
    var stub = {
      ok: false, set: noop, view: noop, recommended: noop, zoom: noop, reset: noop,
      setAutoRotate: noop, getView: function () { return null; }, setView: noop, dispose: noop,
      onInteract: null, onReset: null
    };
    if (!supported()) { fail(container, '你的浏览器暂不支持 WebGL，无法显示 3D 模型。可以换用新版 Chrome、Safari 或 Edge 再试。'); return stub; }

    var canvas = document.createElement('canvas');
    canvas.className = 'bv-canvas';
    canvas.setAttribute('aria-label', model.name + ' 的 3D 模型，可拖动旋转、滚轮或双指缩放');
    container.appendChild(canvas);
    var renderer;
    try { renderer = makeRenderer(canvas); } catch (e) {
      container.removeChild(canvas);
      fail(container, '3D 初始化失败（WebGL 不可用）。可以尝试刷新页面，或换用其他浏览器。');
      return stub;
    }
    renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, COARSE ? 1.75 : 2));
    var S = buildScene(renderer, model, { shadowSize: COARSE ? 1024 : 2048 });
    var scene = S.scene, hlMat = S.hlMat;
    var camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 0.05, 500);
    var dv = model.view || { az: 32, el: 22 };
    var fitViews = orbitViews(dv.el);
    var st = { az: dv.az * DEG, el: dv.el * DEG, dist: 10, target: S.center.clone() };
    var fitFull = 10, w = 1, h = 1;
    var centerV = S.center.clone();

    var state = { mode: 'full', stage: -1, fade: false, focus: false };
    var tween = null, hlPulse = null;
    var needs = true, raf = 0, last = 0, alive = true;
    var auto = false, autoPauseUntil = 0, visible = true;
    var paused = false, watchdog = 0;

    function resize() {
      var r = container.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      w = Math.round(r.width); h = Math.round(r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitFull = fitDistance(S.pts, centerV, fitViews, camera.fov, camera.aspect, opts.margin || 1.05);
      if (!state.focus) st.dist = clampDist(Math.max(st.dist, fitFull));   // 画布变化后保证完整入镜
      invalidate();
    }
    function applyCamera() {
      camera.position.copy(camPos(st.target, st.az, st.el, st.dist));
      camera.lookAt(st.target);
    }
    function invalidate() { needs = true; kick(); }
    // 个别内嵌/省电环境会把 rAF 整体挂起：页面可见时 250ms 没跑起来就改用定时器驱动
    function kick() {
      if (!alive || paused) return;
      if (!raf) raf = requestAnimationFrame(frame);
      if (!watchdog) watchdog = setTimeout(function dog() {
        watchdog = 0;
        if (!raf || !alive || paused) return;
        if (document.visibilityState === 'visible') {
          cancelAnimationFrame(raf); raf = 0; last = 0;
          frame(performance.now());
        } else watchdog = setTimeout(dog, 600);
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
        st.dist = tween.d0 + (tween.d1 - tween.d0) * e;
        st.target.lerpVectors(tween.tg0, tween.tg1, e);
        if (k >= 1) tween = null; else more = true;
      }
      if (inertia && !drag) {
        st.az += inertia.az; st.el = clampEl(st.el + inertia.el);
        inertia.az *= 0.9; inertia.el *= 0.9;
        if (Math.abs(inertia.az) + Math.abs(inertia.el) < 0.0004) inertia = null; else more = true;
      }
      if (auto && visible && !drag && !tween && t > autoPauseUntil) { st.az += dt * 0.24; more = true; }
      if (hlPulse) {
        if (t < hlPulse.t1) {
          var pk = (t - hlPulse.t0) / hlPulse.dur;
          hlMat.opacity = hlPulse.settle + (hlPulse.peak - hlPulse.settle) * (1 - ease.out(pk)) * (0.72 + 0.28 * Math.sin(pk * Math.PI * 3));
          more = true;
        } else { hlMat.opacity = hlPulse.settle; hlPulse = null; }
      }
      if (needs || more) { applyCamera(); renderer.render(scene, camera); needs = false; }
      if (more) kick(); else last = 0;
    }

    function applyState(pulse) {
      var full = state.mode === 'full';
      var sg = full ? null : model.stages[state.stage];
      var n = full ? model.count : (sg ? sg.upto : 0);
      var from = full ? 0 : (sg ? sg.from : 0), to = full ? 0 : (sg ? sg.to : 0);
      S.apply(n, from, to, !full && state.fade);
      if (!full && to > from) {
        var settle = state.fade ? 0.22 : 0.15;
        if (pulse && !REDUCED) {
          var now = performance.now();
          hlPulse = { t0: now, dur: 1500, t1: now + 1500, peak: 0.5, settle: settle };
        } else { hlPulse = null; hlMat.opacity = settle; }
      } else { hlPulse = null; hlMat.opacity = 0; }
      invalidate();
    }
    // 相机对准一组点（聚焦新增部分 / 回到全景）
    function tweenToBox(b, dur) {
      var tg, pts;
      if (b) {
        tg = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        pts = [];
        [b.x0, b.x1].forEach(function (x) { [b.y0, b.y1].forEach(function (y) { [b.z0, b.z1].forEach(function (z) { pts.push([x, y, z]); }); }); });
      } else { tg = centerV.clone(); pts = S.pts; }
      var d = fitDistance(pts, tg, [[st.az, st.el], [st.az + 0.5, st.el], [st.az - 0.5, Math.min(1.3, st.el + 0.3)]], camera.fov, camera.aspect, b ? 1.5 : 1.02);
      if (b) d = Math.max(d, fitFull * 0.22); else d = fitFull;
      tweenCam(tg, st.az / DEG, st.el / DEG, d, dur || 620);
    }
    // azDeg / elDeg 一律为角度（度）；内部统一换算成弧度
    function tweenCam(tg, azDeg, elDeg, d, dur) {
      var a0 = st.az;
      var az = azDeg * DEG, el = elDeg * DEG;
      var dd = ((az - a0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (REDUCED || dur === 0) {
        st.az = a0 + dd; st.el = clampEl(el); st.dist = d; st.target.copy(tg);
        invalidate(); return;
      }
      tween = {
        t0: performance.now(), dur: dur,
        a0: a0, a1: a0 + dd, e0: st.el, e1: clampEl(el),
        d0: st.dist, d1: d, tg0: st.target.clone(), tg1: tg.clone()
      };
      invalidate();
    }

    /* ---------- 指针：单指/左键旋转，双指捏合缩放，滚轮缩放 ---------- */
    var pts = new Map(), drag = null, pinch = null, inertia = null;
    function clampEl(e) { return Math.max(3 * DEG, Math.min(87 * DEG, e)); }
    function clampDist(d) { return Math.max(fitFull * 0.18, Math.min(fitFull * 3.2, d)); }
    function interacted() { tween = null; autoPauseUntil = performance.now() + 3000; if (api.onInteract) api.onInteract(); }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 指针失效不影响手势 */ }
      inertia = null;
      interacted();
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now() };
      else if (pts.size === 2) {
        drag = null;
        var a = Array.from(pts.values());
        pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, dist: st.dist };
      }
    }
    function onMove(e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        var a = Array.from(pts.values());
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
        st.dist = clampDist(pinch.dist * d / pinch.d);
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
      st.dist = clampDist(st.dist * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
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

    var api = {
      ok: true, onInteract: null, onReset: null,
      // o: { mode, stage, fade, focus, pulse }；focus=true 时相机对准本阶段新增部分，切换阶段时跟随
      set: function (o) {
        var focusChanged = false;
        if (o.mode != null) state.mode = o.mode;
        if (o.stage != null) state.stage = o.stage;
        if (o.fade != null) state.fade = !!o.fade;
        if (o.focus != null && o.focus !== state.focus) { state.focus = !!o.focus; focusChanged = true; }
        var sg = state.mode === 'stage' ? model.stages[state.stage] : null;
        applyState(o.pulse !== false);
        if (state.focus && state.mode === 'stage' && sg) tweenToBox(sg.box, focusChanged || o.forceFocus ? 700 : 600);
        else if (focusChanged || o.forceFocus) tweenToBox(null, 620);
      },
      view: function (name) {
        // 快捷视角始终回到全景（聚焦状态由页面同步取消）
        var V = { front: [0, 10], side: [90, 10], top: [0, 86], iso: [dv.az, dv.el] }[name] || [dv.az, dv.el];
        interacted();
        state.focus = false;
        tweenCam(centerV, V[0], V[1], name === 'top' ? fitFull * 0.95 : fitFull, 650);
        if (api.onReset) api.onReset();
      },
      recommended: function (v) {
        // 只转角度，保留用户距离与聚焦目标
        interacted();
        v = v || dv;
        tweenCam(st.target.clone(), v.az, v.el, st.dist, 700);
      },
      zoom: function (dir) { interacted(); tweenCam(st.target.clone(), st.az / DEG, st.el / DEG, clampDist(st.dist * (dir > 0 ? 0.8 : 1.25)), 260); },
      reset: function () {
        interacted();
        state.focus = false;
        tweenCam(centerV, dv.az, dv.el, fitFull, 600);
        if (api.onReset) api.onReset();
      },
      getView: function () { return { az: st.az / DEG, el: st.el / DEG, dist: st.dist, target: st.target.toArray() }; },
      setView: function (v) {
        if (!v) return;
        st.az = v.az * DEG; st.el = clampEl(v.el * DEG);
        if (v.dist) st.dist = v.dist;
        if (v.target) st.target.fromArray(v.target);
        invalidate();
      },
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
    st.dist = fitFull;
    api.set({ mode: state.mode, stage: state.stage, pulse: false });
    // 首帧同步绘制，不依赖 rAF 何时恢复
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    frame(performance.now());
    if (opts.onReady) setTimeout(opts.onReady, 0);
    return api;
  }

  function noop() {}
  function fail(container, msg) {
    var d = document.createElement('div');
    d.className = 'bv-fail';
    d.innerHTML = '<div class="bv-fail-ico">🪵</div><p>' + C.esc(msg) + '</p>';
    container.appendChild(d);
    var ld = container.querySelector('.bv-loading');
    if (ld) ld.remove();
  }

  /* ================= 缩略图：统一视角离屏渲染 + 本地缓存 ================= */
  var thumbR = null, thumbTimer = 0;
  function thumbnail(model, w, h) {
    var key = 'blocks:thumb:' + model.id + ':' + model.hash + ':' + w + 'x' + h;
    try { var hit = localStorage.getItem(key); if (hit) return hit; } catch (e) { /* 忽略 */ }
    if (!supported()) return null;
    try {
      if (!thumbR) {
        thumbR = makeRenderer(document.createElement('canvas'));
        thumbR.setPixelRatio(1);
      }
      thumbR.setSize(w, h, false);
      var S = buildScene(thumbR, model, { shadowSize: 1024 });
      S.apply(model.count, 0, 0, false);
      var cam = new THREE.PerspectiveCamera(28, w / h, 0.05, 500);
      var c = S.center.clone();
      var v = model.view || { az: 32, el: 22 }, az = v.az * DEG, el = (v.el + 4) * DEG;
      cam.position.copy(camPos(c, az, el, fitDistance(S.pts, c, [[az, el]], 28, w / h, 1.1)));
      cam.lookAt(c);
      thumbR.render(S.scene, cam);
      var fmt = 'image/webp', url = thumbR.domElement.toDataURL(fmt, 0.9);
      if (url.indexOf('data:image/webp') !== 0) url = thumbR.domElement.toDataURL('image/png');
      S.dispose();
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf('blocks:thumb:' + model.id + ':') === 0 && k !== key) localStorage.removeItem(k);
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

  G.BlocksView = { create: create, thumbnail: thumbnail, supported: supported, REDUCED: REDUCED, COARSE: COARSE };
})(window);
