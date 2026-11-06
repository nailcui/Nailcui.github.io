/*
 * 磁力片搭建 · 核心数据层（片型体系 / 配色 / 几何分析 / 步骤说明 / 材料统计 / 本地存储）
 *
 * 尺寸体系（单位 1 = 正方形边长，对应实物约 7.5cm）：
 *   正方形 square      ：四边均为 1
 *   等边三角形 triEq   ：三边均为 1（与正方形边长一致，可直接吸合）
 *   直角三角形 triRight：等腰直角，两直角边为 1、斜边 √2（即半个正方形）
 * 每片零件只记录世界坐标下的角点（按片型固定顺序），厚度、边框、材质由渲染层统一处理，
 * 同一份零件数据驱动 3D 模型、分步展示和材料统计。
 */
(function (G) {
  'use strict';

  var EPS = 1e-3;
  var SQ3 = Math.sqrt(3);

  var TYPES = {
    square:   { id: 'square',   name: '正方形',     edges: 4, size: '边长 1 单位' },
    triEq:    { id: 'triEq',    name: '等边三角形', edges: 3, size: '三边均为 1 单位' },
    triRight: { id: 'triRight', name: '直角三角形', edges: 3, size: '直角边 1 单位 · 斜边 √2' }
  };
  var TYPE_ORDER = ['square', 'triEq', 'triRight'];

  var COLORS = {
    blue:   { id: 'blue',   name: '蓝色',   hex: '#3d8fe0' },
    green:  { id: 'green',  name: '绿色',   hex: '#2bb07c' },
    yellow: { id: 'yellow', name: '黄色',   hex: '#f2ac2a' },
    coral:  { id: 'coral',  name: '珊瑚粉', hex: '#ee6a55' },
    purple: { id: 'purple', name: '紫色',   hex: '#9470d6' }
  };
  var COLOR_ORDER = ['yellow', 'coral', 'green', 'blue', 'purple'];

  var THEMES = {
    building:  { id: 'building',  name: '建筑',     icon: '🏠' },
    animal:    { id: 'animal',    name: '动物',     icon: '🐤' },
    vehicle:   { id: 'vehicle',   name: '交通',     icon: '🚗' },
    creative:  { id: 'creative',  name: '创意造型', icon: '✨' }
  };
  var THEME_ORDER = ['building', 'animal', 'vehicle', 'creative'];
  var LEVELS = { 1: '入门', 2: '进阶', 3: '挑战' };

  /* ---------- 向量 ---------- */
  var V = {
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    mul: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    norm: function (a) { var l = V.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    mid: function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; },
    near: function (a, b) { return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS && Math.abs(a[2] - b[2]) < EPS; }
  };

  /* ---------- 造型作者用的零件构造器（角点顺序即片型局部顺序） ---------- */
  // 正方形：o, o+u, o+u+v, o+v（u、v 为单位方向）
  function square(o, u, v) {
    return [o, V.add(o, u), V.add(V.add(o, u), v), V.add(o, v)];
  }
  // 等边三角形：底边 a→b（长 1），顶点朝 up 方向（自动正交化到片面内）
  function triEq(a, b, up) {
    var d = V.norm(V.sub(b, a));
    var w = V.norm(V.sub(up, V.mul(d, V.dot(up, d))));
    return [a, b, V.add(V.mid(a, b), V.mul(w, SQ3 / 2))];
  }
  // 直角三角形：直角在 o，两直角边沿 u、v
  function triRight(o, u, v) {
    return [o, V.add(o, u), V.add(o, v)];
  }

  /* ---------- 单片几何：中心、法向、局部坐标系 ---------- */
  function pieceFrame(p) {
    var pts = p.pts, c = [0, 0, 0], i;
    for (i = 0; i < pts.length; i++) c = V.add(c, pts[i]);
    c = V.mul(c, 1 / pts.length);
    var X = V.norm(V.sub(pts[1], pts[0])), Y;
    if (p.type === 'triEq') Y = V.norm(V.sub(pts[2], V.mid(pts[0], pts[1])));
    else if (p.type === 'triRight') Y = V.norm(V.sub(pts[2], pts[0]));
    else Y = V.norm(V.sub(pts[3], pts[0]));
    var Z = V.norm(V.cross(X, Y));
    return { c: c, X: X, Y: Y, Z: Z };
  }

  // 片型的局部二维轮廓（中心在原点，角点顺序与构造器一致）
  function localOutline(type) {
    if (type === 'square') return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    if (type === 'triEq') return [[-0.5, -SQ3 / 6], [0.5, -SQ3 / 6], [0, SQ3 / 3]];
    return [[-1 / 3, -1 / 3], [2 / 3, -1 / 3], [-1 / 3, 2 / 3]];
  }
  // 内切圆心与半径（正方形、三角形都是切线多边形，按内心等比内缩即为等距内缩）
  function incircle(type) {
    if (type === 'square') return { c: [0, 0], r: 0.5 };
    if (type === 'triEq') return { c: [0, 0], r: SQ3 / 6 };
    // 等腰直角（直角边 1）：内心距两直角边 r = (2 - √2) / 2
    var r = (2 - Math.SQRT2) / 2;
    return { c: [-1 / 3 + r, -1 / 3 + r], r: r };
  }

  function edgesOf(p) {
    var out = [], n = p.pts.length;
    for (var i = 0; i < n; i++) out.push([p.pts[i], p.pts[(i + 1) % n], i]);
    return out;
  }
  function sameEdge(e1, e2) {
    return (V.near(e1[0], e2[0]) && V.near(e1[1], e2[1])) || (V.near(e1[0], e2[1]) && V.near(e1[1], e2[0]));
  }

  /* ---------- 方位与边的中文描述 ---------- */
  function sideWord(vec) {
    // 世界方向：-x 左、+x 右、+z 前、-z 后
    var ax = Math.abs(vec[0]), az = Math.abs(vec[2]);
    if (ax < 0.05 && az < 0.05) return '';
    if (ax >= az) return vec[0] > 0 ? '右' : '左';
    return vec[2] > 0 ? '前' : '后';
  }
  function edgeName(p, ei, fr) {
    // 三角形用片型自身的边名：等边三角形的第 0 条边是构造时的底边；直角三角形分直角边与斜边
    if (p.type === 'triEq') return ei === 0 ? '底边' : '侧边';
    if (p.type === 'triRight') return ei === 1 ? '斜边' : '一条直角边';
    var e = edgesOf(p)[ei], a = e[0], b = e[1];
    var d = V.norm(V.sub(b, a));
    var m = V.mid(a, b);
    var flat = Math.abs(fr.Z[1]) > 0.9;
    if (flat) {
      var w = sideWord(V.sub(m, fr.c));
      return (w || '一') + '侧边';
    }
    if (Math.abs(d[1]) < 0.12) {
      var lowY = Math.min.apply(null, p.pts.map(function (q) { return q[1]; }));
      var highY = Math.max.apply(null, p.pts.map(function (q) { return q[1]; }));
      if (Math.abs(m[1] - lowY) < 0.02) return '底边';
      if (Math.abs(m[1] - highY) < 0.02) return '顶边';
      return '横边';
    }
    if (Math.abs(d[1]) > 0.97) {
      var s = sideWord(V.sub(m, fr.c));
      return (s ? '靠' + s + '的' : '') + '竖边';
    }
    return '斜边';
  }
  function poseWord(p, fr, onGround) {
    var ny = Math.abs(fr.Z[1]);
    if (ny > 0.9) return onGround ? '平铺在地面上' : '水平架起';
    if (ny < 0.1) return onGround ? '竖直立在地面上' : '竖直立起';
    return '斜着搭上去';
  }

  /* ---------- 造型分析：校验 + 邻接 + 自动说明 + 统计 ---------- */
  function analyze(model) {
    var P = model.pieces, n = P.length, i, j;
    var minY = Infinity, box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    var issues = [];
    var ids = {};
    for (i = 0; i < n; i++) {
      var p = P[i];
      if (ids[p.id]) issues.push('重复 ID：' + p.id);
      ids[p.id] = 1;
      p.index = i;
      p.fr = pieceFrame(p);
      p.pts.forEach(function (q) {
        for (var k = 0; k < 3; k++) {
          if (q[k] < box.min[k]) box.min[k] = q[k];
          if (q[k] > box.max[k]) box.max[k] = q[k];
        }
        if (q[1] < minY) minY = q[1];
      });
      // 边长校验：零件不得被拉伸
      edgesOf(p).forEach(function (e) {
        var L = V.len(V.sub(e[1], e[0]));
        var ok = Math.abs(L - 1) < EPS || (p.type === 'triRight' && Math.abs(L - Math.SQRT2) < EPS);
        if (!ok) issues.push(p.id + ' 边长异常 ' + L.toFixed(3));
      });
    }
    for (i = 0; i < n; i++) {
      var a = P[i];
      a.onGround = a.pts.some(function (q) { return Math.abs(q[1] - minY) < EPS; }) &&
        a.pts.filter(function (q) { return Math.abs(q[1] - minY) < EPS; }).length >= 2;
      a.links = [];     // 与之前零件共享的整边：{ other, myEdge, otherEdge }
      a.allLinks = 0;   // 与全部零件共享的不同边数（判断是否只靠一条边悬挑）
      var myShared = {};
      for (j = 0; j < n; j++) {
        if (j === i) continue;
        var b = P[j];
        edgesOf(a).forEach(function (ea) {
          edgesOf(b).forEach(function (eb) {
            if (sameEdge(ea, eb)) {
              myShared[ea[2]] = 1;
              if (j < i) a.links.push({ other: j, myEdge: ea[2], otherEdge: eb[2] });
            }
          });
        });
      }
      a.allLinks = Object.keys(myShared).length;
      if (i > 0 && !a.onGround && !a.links.length) issues.push(a.id + ' 搭建时悬空（没有与之前的零件整边吸合）');
    }
    // 底部有整边支撑的竖直片视为「立稳」；其余仅一条边相连的片提示扶稳
    for (i = 0; i < n; i++) {
      var q = P[i];
      var vertical = Math.abs(q.fr.Z[1]) < 0.3;
      var restsOnEdge = q.links.some(function (L) {
        return edgeName(q, L.myEdge, q.fr) === '底边';
      });
      q.cantilever = !q.onGround && q.allLinks <= 1 && !(vertical && restsOnEdge);
    }
    model.box = box;
    model.issues = issues;
    model.stats = countPieces(P, n);
    // 阶段索引
    (model.stages || []).forEach(function (st, si) {
      for (var k = st.from; k <= st.to; k++) P[k].stage = si;
    });
    // 自动生成说明（作者可用 note 覆盖）
    var center = [(box.min[0] + box.max[0]) / 2, 0, (box.min[2] + box.max[2]) / 2];
    for (i = 0; i < n; i++) P[i].text = P[i].note || autoNote(model, i, center);
    model.analyzed = true;
    return model;
  }

  function pieceLabel(p) {
    return COLORS[p.color].name + TYPES[p.type].name;
  }

  function autoNote(model, i, center) {
    var P = model.pieces, p = P[i];
    var head = '取 1 片' + pieceLabel(p) + '，' + poseWord(p, p.fr, p.onGround);
    var where = '';
    if (p.where) where = '，放在' + p.where;
    var body;
    if (p.links.length) {
      var L = p.links[0], o = P[L.other];
      body = '，用它的' + edgeName(p, L.myEdge, p.fr) + '对齐第 ' + (L.other + 1) + ' 片（' + pieceLabel(o) + '）的' +
        edgeName(o, L.otherEdge, o.fr) + '吸合';
      var more = [];
      p.links.slice(1).forEach(function (l) {
        if (more.indexOf(l.other + 1) < 0 && l.other !== L.other) more.push(l.other + 1);
      });
      if (more.length) body += '，同时贴住第 ' + more.join('、') + ' 片';
    } else if (p.onGround) {
      body = i === 0 ? '，作为整件作品的起点' : '';
    } else {
      body = '';
    }
    var tail = '。';
    if (p.cantilever) tail = '。这片只靠一条边吸住，放好后轻轻扶正。';
    return head + where + body + tail;
  }

  function countPieces(P, upto) {
    var byKey = {}, byType = {}, total = 0;
    for (var i = 0; i < upto && i < P.length; i++) {
      var p = P[i], k = p.type + ':' + p.color;
      byKey[k] = (byKey[k] || 0) + 1;
      byType[p.type] = (byType[p.type] || 0) + 1;
      total++;
    }
    return { byKey: byKey, byType: byType, total: total };
  }

  // 材料清单行：按片型、颜色排序
  function materialRows(model, upto) {
    var all = countPieces(model.pieces, model.pieces.length);
    var used = countPieces(model.pieces, upto == null ? model.pieces.length : upto);
    var rows = [];
    TYPE_ORDER.forEach(function (t) {
      COLOR_ORDER.forEach(function (c) {
        var k = t + ':' + c;
        if (all.byKey[k]) rows.push({ type: t, color: c, need: all.byKey[k], used: used.byKey[k] || 0 });
      });
    });
    return { rows: rows, all: all, used: used };
  }

  /* ---------- 本地存储 ---------- */
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存储不可用时静默 */ }
    }
  };
  var KEYS = { fav: 'tiles:fav', progress: 'tiles:progress', last: 'tiles:last', inv: 'tiles:inv' };

  function getProgress(id) { return (store.get(KEYS.progress, {}) || {})[id] || null; }
  function saveProgress(id, step, total) {
    var all = store.get(KEYS.progress, {}) || {};
    all[id] = { step: step, total: total, ts: Date.now() };
    store.set(KEYS.progress, all);
    store.set(KEYS.last, { id: id, ts: Date.now() });
  }
  function getFavs() { return store.get(KEYS.fav, []) || []; }
  function isFav(id) { return getFavs().indexOf(id) >= 0; }
  function toggleFav(id) {
    var f = getFavs(), i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    store.set(KEYS.fav, f);
    return i < 0;
  }

  // 数据指纹：缩略图缓存随零件数据变化自动失效
  function modelHash(model) {
    var s = model.id + '|' + model.pieces.map(function (p) {
      return p.type + p.color + p.pts.map(function (q) { return q.map(function (x) { return x.toFixed(3); }).join(','); }).join(';');
    }).join('|');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 片型小图标（SVG），用于材料清单、库存与片型说明
  function typeIcon(type, color, size) {
    var hex = color ? COLORS[color].hex : '#9aa3ad';
    size = size || 22;
    var pts;
    if (type === 'square') pts = '3,3 19,3 19,19 3,19';
    else if (type === 'triEq') pts = '2,19 20,19 11,3.4';
    else pts = '3,3 3,19 19,19';
    return '<svg class="ticon" width="' + size + '" height="' + size + '" viewBox="0 0 22 22" aria-hidden="true">' +
      '<polygon points="' + pts + '" fill="' + hex + '" fill-opacity=".32" stroke="' + hex + '" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  }

  G.TilesCore = {
    EPS: EPS, TYPES: TYPES, TYPE_ORDER: TYPE_ORDER, COLORS: COLORS, COLOR_ORDER: COLOR_ORDER,
    THEMES: THEMES, THEME_ORDER: THEME_ORDER, LEVELS: LEVELS,
    V: V, square: square, triEq: triEq, triRight: triRight,
    pieceFrame: pieceFrame, localOutline: localOutline, incircle: incircle,
    analyze: analyze, countPieces: countPieces, materialRows: materialRows, pieceLabel: pieceLabel,
    store: store, KEYS: KEYS, getProgress: getProgress, saveProgress: saveProgress,
    getFavs: getFavs, isFav: isFav, toggleFav: toggleFav, modelHash: modelHash, esc: esc, typeIcon: typeIcon
  };
})(typeof window !== 'undefined' ? window : globalThis);
