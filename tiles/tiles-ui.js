/*
 * 磁力片搭建 · 页面公共部件：造型卡片、缩略图队列（统一视角离屏渲染 + 本地缓存）、收藏、材料是否够用
 */
(function (G) {
  'use strict';
  var C = G.TilesCore, M = G.TilesModels;
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.8 1.4-1.7 2.8-2.8 4.8-2.8 3.6 0 5.8 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  var THUMB_W = 480, THUMB_H = 360;

  function progressText(m) {
    var p = C.getProgress(m.id), n = m.pieces.length;
    if (!p) return '';
    return p.step >= n ? '已完成 ✓' : '已搭到 ' + p.step + ' / ' + n;
  }

  function metaTags(m) {
    return '<span class="tag">' + m.pieces.length + ' 片</span>' +
      '<span class="tag lv' + m.level + '">' + C.LEVELS[m.level] + '</span>' +
      '<span class="tag">' + C.THEMES[m.theme].name + '</span>';
  }

  function card(m) {
    var fav = C.isFav(m.id), pt = progressText(m);
    return '<article class="mcard" data-id="' + m.id + '">' +
      '<a class="mc-link" href="build.html?id=' + m.id + '" aria-label="打开「' + C.esc(m.name) + '」的搭建教学"></a>' +
      '<div class="mc-thumb" data-thumb="' + m.id + '"><span class="ph" aria-hidden="true">🧩</span>' +
      (pt ? '<span class="mc-prog">' + pt + '</span>' : '') + '</div>' +
      '<div class="mc-body"><div class="mc-name">' + C.esc(m.name) + '</div><div class="mc-meta">' + metaTags(m) + '</div></div>' +
      '<button type="button" class="mc-fav' + (fav ? ' on' : '') + '" data-fav="' + m.id + '" aria-pressed="' + fav + '" aria-label="收藏「' + C.esc(m.name) + '」">' + HEART + '</button>' +
      '</article>';
  }

  // 收藏按钮（事件委托），onChange 可选回调
  function bindFavs(root, onChange) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fav]');
      if (!b) return;
      e.preventDefault();
      var on = C.toggleFav(b.dataset.fav);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      if (onChange) onChange(b.dataset.fav, on);
    });
  }

  // 缩略图：先用缓存，没有缓存的逐个在空闲时渲染，不为每张卡片常驻 WebGL 场景
  var queue = [], busy = false;
  var idle = G.requestIdleCallback || function (fn) { return setTimeout(fn, 30); };
  function fill(el, url) {
    if (!url || el.querySelector('img')) return;
    var img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    var ph = el.querySelector('.ph');
    if (ph) ph.remove();
    el.insertBefore(img, el.firstChild);
  }
  function cached(m) {
    try { return localStorage.getItem('tiles:thumb:' + m.id + ':' + m.hash + ':' + THUMB_W + 'x' + THUMB_H); } catch (e) { return null; }
  }
  function loadThumbs(root) {
    root.querySelectorAll('[data-thumb]').forEach(function (el) {
      var m = M.get(el.dataset.thumb);
      if (!m) return;
      var hit = cached(m);
      if (hit) fill(el, hit); else queue.push(el);
    });
    pump();
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    idle(function () {
      var el = queue.shift(), m = M.get(el.dataset.thumb);
      var url = m && G.TilesView ? G.TilesView.thumbnail(m, THUMB_W, THUMB_H) : null;
      // 同一造型的其它卡片一起填上
      document.querySelectorAll('[data-thumb="' + el.dataset.thumb + '"]').forEach(function (x) { fill(x, url); });
      queue = queue.filter(function (x) { return !x.querySelector('img'); });
      busy = false;
      pump();
    });
  }

  // 库存（按片型）是否够搭某个造型
  function getInv() { return C.store.get(C.KEYS.inv, null); }
  function check(m, inv) {
    var miss = [];
    C.TYPE_ORDER.forEach(function (t) {
      var need = m.stats.byType[t] || 0, have = (inv && inv[t]) || 0;
      if (need > have) miss.push({ type: t, n: need - have });
    });
    return { ok: !miss.length, miss: miss };
  }

  function needText(m) {
    return C.TYPE_ORDER.filter(function (t) { return m.stats.byType[t]; }).map(function (t) {
      return C.TYPES[t].name + ' ' + m.stats.byType[t];
    }).join(' · ');
  }

  // 最近一次有进度的造型（「继续搭建」入口）
  function lastProgress() {
    var all = C.store.get(C.KEYS.progress, {}) || {}, best = null;
    Object.keys(all).forEach(function (id) {
      var m = M.get(id), p = all[id];
      if (m && p && (!best || p.ts > best.p.ts)) best = { m: m, p: p };
    });
    return best;
  }

  G.TilesUI = {
    HEART: HEART, card: card, metaTags: metaTags, bindFavs: bindFavs, loadThumbs: loadThumbs,
    getInv: getInv, check: check, needText: needText, progressText: progressText, lastProgress: lastProgress
  };
})(window);
