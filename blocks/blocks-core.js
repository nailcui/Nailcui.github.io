/*
 * 阿基米德积木 · 核心数据层（木条规格 / 作品构造器 / 几何校验 / 阶段统计 / 本地存储）
 *
 * 单位：1 = 木条厚度。木条长 × 宽 × 厚 = 15 × 3 × 1（按 120 × 24 × 8 mm 建模，比例 15:3:1）。
 * 这是本项目选定的建模规格，不代表所有品牌的统一标准。
 *
 * 每根木条只记录 { d, e, x, y, z }：
 *   d：长轴方向 'x' 或 'z'（只允许平放 / 侧立两种摆法，所有木条轴对齐，便于精确校验）
 *   e：0 平放（厚度朝上，高 1、占地 15 × 3）；1 侧立（宽度朝上，高 3、占地 15 × 1）
 *   x, y, z：木条中心
 * 尺寸由规格统一决定，作品数据里不存在缩放；同一份数据驱动 3D、阶段、数量与成品尺寸。
 *
 * 校验（check）：①两两 AABB 不相交（允许面贴面）②每根木条要么落地、要么底面落在之前某根木条顶面上，
 * 且承托面积 ≥ 1 单位²；③木条中心落在全部承托面的包围范围内（避免单边悬挑翻倒）。
 * 这是几何层面的检查，不是物理仿真。
 */
(function (G) {
  'use strict';

  var SPEC = {
    L: 15, W: 3, T: 1, MM: 8,
    ratio: '15 : 3 : 1',
    sizeText: '120 × 24 × 8 mm'
  };
  var EPS = 1e-6;
  var MIN_AREA = 1 - 1e-6;          // 最小承托面积：1 单位²（8 × 8 mm）

  var CATS = {
    tower:    { id: 'tower',    name: '高塔',       icon: '🗼', blurb: '交错叠放、逐层向上' },
    bridge:   { id: 'bridge',   name: '桥梁',       icon: '🌉', blurb: '桥台承托、压梁锁扣' },
    building: { id: 'building', name: '建筑',       icon: '🏯', blurb: '门洞、门楣与屋顶' },
    creative: { id: 'creative', name: '几何与创意', icon: '✦',  blurb: '对称、收分与节奏' }
  };
  var CAT_ORDER = ['tower', 'bridge', 'building', 'creative'];
  var LEVELS = { 1: '入门', 2: '进阶', 3: '挑战' };

  /* ---------- 构造器：底面高度 yb，中心由规格推出 ---------- */
  function stick(d, e, x, z, yb) {
    return { d: d, e: e ? 1 : 0, x: x, z: z, y: yb + (e ? SPEC.W : SPEC.T) / 2 };
  }
  var B = {
    fx: function (x, z, yb) { return stick('x', 0, x, z, yb); },   // 平放，长轴沿 x
    fz: function (x, z, yb) { return stick('z', 0, x, z, yb); },   // 平放，长轴沿 z
    ex: function (x, z, yb) { return stick('x', 1, x, z, yb); },   // 侧立，长轴沿 x
    ez: function (x, z, yb) { return stick('z', 1, x, z, yb); }    // 侧立，长轴沿 z
  };

  /* ---------- 单根几何 ---------- */
  function half(s) {
    var w = s.e ? SPEC.T : SPEC.W;
    return {
      x: s.d === 'x' ? SPEC.L / 2 : w / 2,
      y: (s.e ? SPEC.W : SPEC.T) / 2,
      z: s.d === 'z' ? SPEC.L / 2 : w / 2
    };
  }
  function aabb(s) {
    var h = half(s);
    return { x0: s.x - h.x, x1: s.x + h.x, y0: s.y - h.y, y1: s.y + h.y, z0: s.z - h.z, z1: s.z + h.z };
  }
  function corners(b) {
    return [
      [b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0],
      [b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x0, b.y1, b.z1], [b.x1, b.y1, b.z1]
    ];
  }
  function bboxOf(sticks, n) {
    var b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    for (var i = 0; i < (n == null ? sticks.length : n); i++) {
      var a = sticks[i].box;
      if (a.x0 < b.x0) b.x0 = a.x0; if (a.x1 > b.x1) b.x1 = a.x1;
      if (a.y0 < b.y0) b.y0 = a.y0; if (a.y1 > b.y1) b.y1 = a.y1;
      if (a.z0 < b.z0) b.z0 = a.z0; if (a.z1 > b.z1) b.z1 = a.z1;
    }
    return b;
  }
  function poseText(s) {
    return (s.e ? '侧立' : '平放') + '·沿' + (s.d === 'x' ? '左右' : '前后');
  }

  /* ---------- 几何校验 ---------- */
  function check(model) {
    var S = model.sticks, issues = [], i, j;
    for (i = 0; i < S.length; i++) {
      var a = S[i].box;
      if (a.y0 < -EPS) issues.push({ type: 'below', stick: i + 1, msg: '第 ' + (i + 1) + ' 根低于地面' });
      // 相交：三个轴向都有正的重叠深度
      for (j = 0; j < i; j++) {
        var b = S[j].box;
        var dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        var dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        var dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (dx > 1e-4 && dy > 1e-4 && dz > 1e-4) {
          issues.push({ type: 'overlap', stick: i + 1, other: j + 1, msg: '第 ' + (i + 1) + ' 根与第 ' + (j + 1) + ' 根相互穿插' });
        }
      }
      // 承托：落地，或底面落在之前木条的顶面上
      if (a.y0 > EPS) {
        var cx0 = Infinity, cx1 = -Infinity, cz0 = Infinity, cz1 = -Infinity, area = 0, parts = [];
        for (j = 0; j < i; j++) {
          var t = S[j].box;
          if (Math.abs(t.y1 - a.y0) > 1e-4) continue;
          var ox0 = Math.max(a.x0, t.x0), ox1 = Math.min(a.x1, t.x1), oz0 = Math.max(a.z0, t.z0), oz1 = Math.min(a.z1, t.z1);
          if (ox1 - ox0 <= 1e-4 || oz1 - oz0 <= 1e-4) continue;
          area += (ox1 - ox0) * (oz1 - oz0);
          parts.push(j + 1);
          if (ox0 < cx0) cx0 = ox0; if (ox1 > cx1) cx1 = ox1;
          if (oz0 < cz0) cz0 = oz0; if (oz1 > cz1) cz1 = oz1;
        }
        if (area < MIN_AREA) {
          issues.push({ type: 'float', stick: i + 1, msg: '第 ' + (i + 1) + ' 根悬空（放置时下方没有足够的承托面）' });
        } else {
          var cx = S[i].x, cz = S[i].z;
          if (cx < cx0 - EPS || cx > cx1 + EPS || cz < cz0 - EPS || cz > cz1 + EPS) {
            issues.push({ type: 'balance', stick: i + 1, msg: '第 ' + (i + 1) + ' 根重心落在承托范围之外，会翻倒' });
          }
          S[i].on = parts;
        }
      } else S[i].on = [];
    }
    // 阶段划分
    var prev = 0;
    model.stages.forEach(function (st, k) {
      if (!(st.upto > prev)) issues.push({ type: 'stage', msg: '阶段 ' + (k + 1) + ' 的 upto 必须递增' });
      prev = st.upto;
    });
    if (prev !== S.length) issues.push({ type: 'stage', msg: '最后一个阶段必须覆盖全部木条（' + prev + ' ≠ ' + S.length + '）' });
    return issues;
  }

  /* ---------- 作品整理：编号、阶段归属、包围盒、尺寸、指纹 ---------- */
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function prepare(m) {
    var S = m.sticks;
    S.forEach(function (s, i) { s.n = i + 1; s.box = aabb(s); s.half = half(s); });
    var prev = 0;
    m.stages.forEach(function (st, i) {
      st.index = i; st.from = prev; st.to = st.upto; st.count = st.upto - prev; prev = st.upto;
      // 本阶段新增部分的包围盒
      st.box = st.count > 0 ? bboxOf(S.slice(st.from, st.to)) : null;
      st.cum = bboxOf(S, st.to);
    });
    S.forEach(function (s) {
      for (var k = 0; k < m.stages.length; k++) if (s.n <= m.stages[k].upto) { s.stage = k; break; }
    });
    m.count = S.length;
    m.box = bboxOf(S);
    m.dims = { x: m.box.x1 - m.box.x0, y: m.box.y1 - m.box.y0, z: m.box.z1 - m.box.z0 };
    m.dimsMM = { x: Math.round(m.dims.x * SPEC.MM), y: Math.round(m.dims.y * SPEC.MM), z: Math.round(m.dims.z * SPEC.MM) };
    m.poses = {};
    S.forEach(function (s) { var k = poseText(s); m.poses[k] = (m.poses[k] || 0) + 1; });
    m.hash = hashStr(JSON.stringify(S.map(function (s) { return [s.d, s.e, s.x, s.y, s.z]; })) + '|' + m.stages.length);
    m.issues = check(m);
    return m;
  }
  function dimsText(m) {
    return '长 ' + m.dimsMM.x + ' × 宽 ' + m.dimsMM.z + ' × 高 ' + m.dimsMM.y + ' mm';
  }

  /* ---------- 本地存储 ---------- */
  var KEYS = { fav: 'blocks:fav', recent: 'blocks:recent', last: 'blocks:last' };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存储不可用时静默 */ } }
  };
  function favs() { var v = store.get(KEYS.fav, []); return Array.isArray(v) ? v : []; }
  function isFav(id) { return favs().indexOf(id) >= 0; }
  function toggleFav(id) {
    var f = favs(), i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.unshift(id);
    store.set(KEYS.fav, f);
    return i < 0;
  }
  function recents() { var v = store.get(KEYS.recent, []); return Array.isArray(v) ? v : []; }
  function touchRecent(id, stage) {
    var r = recents().filter(function (x) { return x && x.id !== id; });
    r.unshift({ id: id, ts: Date.now(), stage: stage == null ? null : stage });
    store.set(KEYS.recent, r.slice(0, 8));
    store.set(KEYS.last, id);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  G.BlocksCore = {
    SPEC: SPEC, CATS: CATS, CAT_ORDER: CAT_ORDER, LEVELS: LEVELS, B: B,
    aabb: aabb, corners: corners, bboxOf: bboxOf, poseText: poseText,
    check: check, prepare: prepare, dimsText: dimsText,
    KEYS: KEYS, store: store, favs: favs, isFav: isFav, toggleFav: toggleFav, recents: recents, touchRecent: touchRecent,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
