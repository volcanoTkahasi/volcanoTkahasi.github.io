/* atalabo ツールズ 共通UI */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.$ = $; window.$$ = $$;

  // クリップボードにコピー（data-copy="#id"）
  window.copyText = function (text, btn) {
    var done = function () { if (!btn) return; var o = btn.textContent; btn.textContent = 'コピーしました'; setTimeout(function () { btn.textContent = o; }, 1400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(t); done(); }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var el = $(b.getAttribute('data-copy')); if (!el) return;
    copyText('value' in el && el.tagName !== 'DIV' ? el.value : el.textContent, b);
  });
  // タブ切替（.tabs[data-tabs] button[data-tab]）
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.tabs button[data-tab]'); if (!b) return;
    var box = b.closest('.tabs');
    $$('button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
    $$('[data-panel]', box.parentNode).forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== b.getAttribute('data-tab'); });
  });
  window.download = function (blobOrUrl, name) {
    var a = document.createElement('a'); a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  // トップページの検索フィルタ
  var q = $('#q');
  if (q) {
    var norm = function (s) { return (s || '').toLowerCase().replace(/[\u30A1-\u30F6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); };
    var run = function () {
      var v = norm(q.value.trim()), any = false;
      $$('.cat').forEach(function (cat) {
        var vis = 0;
        $$('.tool', cat).forEach(function (t) { var hit = !v || norm(t.textContent + ' ' + (t.getAttribute('data-kw') || '')).indexOf(v) >= 0; t.hidden = !hit; if (hit) vis++; });
        cat.hidden = !vis; if (vis) any = true;
      });
      var nr = $('#noresult'); if (nr) nr.hidden = any;
    };
    q.addEventListener('input', run);
  }
})();
