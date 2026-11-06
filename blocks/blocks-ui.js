/*
 * 阿基米德积木 · 页面公共部件：作品卡片、缩略图队列（统一视角离屏渲染 + 本地缓存）、收藏、最近查看
 */
(function (G) {
  'use strict';
  var C = G.BlocksCore, M = G.BlocksModels;
  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.8 1.4-1.7 2.8-2.8 4.8-2.8 3.6 0 5.8 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  var THUMB_W = 480, THUMB_H = 360;

  function metaTags(m) {
    return '<span class="tag">' + m.count + ' 根</span>' +
      '<span class="tag lv' + m.level + '">' + C.LEVELS[m.level] + '</span>' +
      '<span class="tag">' + C.CATS[m.cat].icon + ' ' + C.CATS[m.cat].name + '</span>';
  }

  function card(m, badge) {
    var fav = C.isFav(m.id);
    return '<article class="mcard" data-id="' + m.id + '">' +
      '<a class="mc-link" href="build.html?id=' + m.id + '" aria-label="打开「' + C.esc(m.name) + '」"></a>' +
      '<div class="mc-thumb" data-thumb="' + m.id + '"><span class="ph" aria-hidden="true">🪵</span>' +
      (badge ? '<span class="mc-badge' + (badge.clay ? ' clay' : '') + '">' + badge.text + '</span>' : '') + '</div>' +
      '<div class="mc-body"><div class="mc-name">' + C.esc(m.name) + '</div>' +
      '<div class="mc-meta">' + metaTags(m) + '<span class="tag">' + m.stages.length + ' 个阶段</span></div></div>' +
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
    try { return localStorage.getItem('blocks:thumb:' + m.id + ':' + m.hash + ':' + THUMB_W + 'x' + THUMB_H); } catch (e) { return null; }
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
      var url = m && G.BlocksView ? G.BlocksView.thumbnail(m, THUMB_W, THUMB_H) : null;
      // 同一作品的其它卡片一起填上
      document.querySelectorAll('[data-thumb="' + el.dataset.thumb + '"]').forEach(function (x) { fill(x, url); });
      queue = queue.filter(function (x) { return !x.querySelector('img'); });
      busy = false;
      pump();
    });
  }

  // 最近查看（「继续查看」入口）
  function lastViewed() {
    var r = C.recents();
    for (var i = 0; i < r.length; i++) {
      var m = M.get(r[i].id);
      if (m) return { m: m, ts: r[i].ts, stage: r[i].stage };
    }
    return null;
  }

  G.BlocksUI = {
    HEART: HEART, card: card, metaTags: metaTags, bindFavs: bindFavs, loadThumbs: loadThumbs, lastViewed: lastViewed
  };
})(window);
