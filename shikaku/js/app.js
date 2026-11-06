/* 資格ドリル app.js — 依存ライブラリなし。データは data/bundle.js (window.SHIKAKU_DATA)。 */
(function () {
  "use strict";

  // ---------- 定数・ユーティリティ ----------
  var STORE_KEY = "shikaku-drill:v1";
  var DAY = 86400000;
  var INTERVALS = [1, 3, 7, 14, 30, 60]; // 復習の間隔（日）。正解するたびに次の段階へ。
  var EXAM_COLORS = { denko2: "var(--c-denko2)", otsu4: "var(--c-otsu4)", tsushin2: "var(--c-tsushin2)" };

  var DATA = window.SHIKAKU_DATA;
  var app = document.getElementById("app");
  if (!DATA || !app) {
    if (app) app.innerHTML = '<div class="card empty">問題データを読み込めませんでした。ページを再読み込みしてください。</div>';
    return;
  }
  var EXAMS = DATA.index.exams.map(function (e) { return DATA.exams[e.id]; });
  var QMAP = {};
  EXAMS.forEach(function (ex) {
    ex.catMap = {};
    ex.categories.forEach(function (c) { ex.catMap[c.id] = c; });
    ex.questions.forEach(function (q) { q.exam = ex.id; QMAP[q.id] = q; });
  });

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function todayKey(t) {
    var d = new Date(t || Date.now());
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function toast(msg) {
    $all(".toast").forEach(function (t) { t.remove(); });
    var el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  var ICON = {
    chev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
  };

  // ---------- 保存データ ----------
  function loadStore() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { s = null; }
    s = s && typeof s === "object" ? s : {};
    s.q = s.q || {}; s.bm = s.bm || []; s.log = s.log || {}; s.mocks = s.mocks || [];
    s.settings = s.settings || { theme: "system" };
    return s;
  }
  var store = loadStore();
  var saveWarned = false;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast("学習記録を保存できませんでした（プライベートモード等）"); } }
  }
  function rec(id) { return store.q[id] || (store.q[id] = { r: 0, w: 0 }); }

  /** 解答を記録し、間隔反復のスケジュールを更新する */
  function recordAnswer(q, ok, now) {
    now = now || Date.now();
    var r = rec(q.id);
    r.last = now; r.ok = ok;
    if (ok) {
      r.r++;
      if (typeof r.box === "number") {
        r.box++;
        if (r.box > INTERVALS.length) { delete r.box; r.due = null; r.mastered = now; }
        else { r.due = now + INTERVALS[r.box - 1] * DAY; }
      }
    } else {
      r.w++; r.box = 0; r.due = now; delete r.mastered;
    }
    var day = todayKey(now);
    store.log[q.exam] = store.log[q.exam] || {};
    var d = store.log[q.exam][day] || (store.log[q.exam][day] = [0, 0]);
    d[0]++; if (ok) d[1]++;
  }
  function isDue(id, now) { var r = store.q[id]; return !!(r && typeof r.box === "number" && r.due != null && r.due <= (now || Date.now())); }
  function dueIds(examId) { var now = Date.now(); return examQ(examId).filter(function (q) { return isDue(q.id, now); }).map(function (q) { return q.id; }); }
  function nextDue(examId) {
    var t = Infinity;
    examQ(examId).forEach(function (q) { var r = store.q[q.id]; if (r && typeof r.box === "number" && r.due != null && r.due < t) t = r.due; });
    return t;
  }
  function weakIds(examId) {
    return examQ(examId).filter(function (q) { var r = store.q[q.id]; return r && r.w > 0 && !r.mastered; })
      .sort(function (a, b) { var A = store.q[a.id], B = store.q[b.id]; return (B.w / (B.w + B.r)) - (A.w / (A.w + A.r)); })
      .map(function (q) { return q.id; });
  }
  function examQ(examId) { return DATA.exams[examId].questions; }
  function isBm(id) { return store.bm.indexOf(id) >= 0; }
  function toggleBm(id) {
    var i = store.bm.indexOf(id);
    if (i >= 0) store.bm.splice(i, 1); else store.bm.push(id);
    save(); return i < 0;
  }
  function examStats(examId) {
    var qs = examQ(examId), seen = 0, r = 0, w = 0;
    qs.forEach(function (q) { var x = store.q[q.id]; if (x && (x.r + x.w)) { seen++; r += x.r; w += x.w; } });
    return { total: qs.length, seen: seen, right: r, wrong: w, acc: pct(r, r + w), due: dueIds(examId).length };
  }
  function catStats(examId, catId) {
    var qs = examQ(examId).filter(function (q) { return q.cat === catId; }), seen = 0, r = 0, w = 0;
    qs.forEach(function (q) { var x = store.q[q.id]; if (x && (x.r + x.w)) { seen++; r += x.r; w += x.w; } });
    return { total: qs.length, seen: seen, right: r, wrong: w, acc: pct(r, r + w) };
  }
  function streak() {
    var days = {};
    Object.keys(store.log).forEach(function (e) { Object.keys(store.log[e]).forEach(function (d) { days[d] = 1; }); });
    var n = 0, t = Date.now();
    if (!days[todayKey(t)]) t -= DAY; // 今日まだでも昨日まで続いていれば継続中
    while (days[todayKey(t)]) { n++; t -= DAY; }
    return n;
  }

  // ---------- テーマ ----------
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    var t = store.settings.theme || "system";
    var dark = t === "dark" || (t === "system" && mql && mql.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0e1320" : "#f6f7fb");
  }
  if (mql && mql.addEventListener) mql.addEventListener("change", applyTheme);
  applyTheme();
  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    store.settings.theme = cur === "dark" ? "light" : "dark";
    save(); applyTheme();
    toast(store.settings.theme === "dark" ? "ダークモード" : "ライトモード");
  });

  // ---------- 小さな描画部品 ----------
  function ring(p, color, size) {
    size = size || 56; var r = size / 2 - 5, c = 2 * Math.PI * r, off = c * (1 - p / 100);
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="学習済み ' + p + '%">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="6"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/>' +
      '<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="' + (size * 0.25) + '" font-weight="800" fill="var(--text)">' + p + "%</text></svg>";
  }
  function meter(p, cls) { return '<div class="meter"><i class="' + (cls || "") + '" style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></div>'; }
  function back(href, label) { return '<a class="backlink" href="' + href + '">' + ICON.back + esc(label) + "</a>"; }
  function catName(ex, id) { var c = ex.catMap[id]; return c ? c.name : id; }

  // ---------- 画面: ホーム ----------
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredPrompt = e; var el = $("#install-slot"); if (el) renderInstall(el); });

  function viewHome() {
    var st = streak();
    var totalQ = EXAMS.reduce(function (n, e) { return n + e.questions.length; }, 0);
    var answered = 0, right = 0, wrong = 0;
    EXAMS.forEach(function (e) { var s = examStats(e.id); answered += s.seen; right += s.right; wrong += s.wrong; });
    var cards = EXAMS.map(function (ex) {
      var s = examStats(ex.id), p = pct(s.seen, s.total);
      return '<a class="card exam-card" href="#/exam/' + ex.id + '" style="--ec:' + EXAM_COLORS[ex.id] + '">' + ring(p, EXAM_COLORS[ex.id]) +
        '<div><h3>' + esc(ex.name) + '</h3><div class="meta">' + esc(ex.description) + '</div><div class="meta">' +
        '<span class="pill">' + s.total + "問</span>" + (s.seen ? '<span class="pill">正答率 ' + s.acc + "%</span>" : "") +
        (s.due ? '<span class="pill due">復習 ' + s.due + "</span>" : "") + "</div></div>" + '<span class="chev">' + ICON.chev + "</span></a>";
    }).join("");
    app.innerHTML = '<div class="view">' +
      '<section class="hero"><h1>スキマ時間で、<br><span class="accent">工業系資格</span>をドリル。</h1>' +
      '<p>第二種電気工事士・危険物乙4・2級電気通信工事施工管理（第一次検定）のオリジナル4択問題を、分野別・ランダム・本番形式の模試で。間違えた問題は自動で復習に回ります。</p>' +
      '<div class="badges"><span class="badge free">完全無料</span><span class="badge">登録不要</span><span class="badge">オフライン対応</span><span class="badge unofficial">非公式</span></div></section>' +
      (answered ? '<div class="tiles" style="margin-top:14px">' +
        '<div class="tile"><div class="k">連続学習</div><div class="v">' + st + "<small>日</small></div></div>" +
        '<div class="tile"><div class="k">学習済み</div><div class="v">' + answered + "<small>/ " + totalQ + "</small></div></div>" +
        '<div class="tile"><div class="k">解答数</div><div class="v">' + (right + wrong) + "<small>回</small></div></div>" +
        '<div class="tile"><div class="k">正答率</div><div class="v">' + pct(right, right + wrong) + "<small>%</small></div></div></div>" : "") +
      '<h2 class="section-title">資格をえらぶ</h2><div class="stack">' + cards + "</div>" +
      '<div id="install-slot" style="margin-top:14px"></div>' +
      '<h2 class="section-title">このアプリについて</h2>' +
      '<div class="card stack small"><p style="margin:0"><b>無料・非公式</b>の学習アプリです。試験実施団体（電気技術者試験センター、消防試験研究センター、全国建設研修センター等）とは関係ありません。問題はすべて公式資料や法令で確認したうえで作成した<b>オリジナル問題</b>で、過去問の文章は使っていません。</p>' +
      '<div class="notice"><b>ご注意：</b>内容の正確性は保証しません。法令や試験制度は改正されることがあります。受験の際は必ず<b>最新の公式情報</b>を確認してください。</div>' +
      '<div class="row"><a class="btn" href="#/about">出典・詳しい説明</a><a class="btn" href="#/settings">設定・データ</a></div></div>' +
      "</div>";
    renderInstall($("#install-slot"));
  }
  function renderInstall(el) {
    if (!el) return;
    var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) { el.innerHTML = ""; return; }
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (deferredPrompt) {
      el.innerHTML = '<div class="card install-card"><div class="txt"><b>ホーム画面に追加</b><br><span class="muted">アプリのように起動でき、オフラインでも使えます。</span></div><button class="btn primary" id="install-btn">' + ICON.download + "追加</button></div>";
      $("#install-btn").onclick = function () { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function () { deferredPrompt = null; el.innerHTML = ""; }); };
    } else if (ios) {
      el.innerHTML = '<div class="card small muted">iPhone/iPadでは、Safariの共有ボタン →「ホーム画面に追加」でアプリのように使えます。</div>';
    } else el.innerHTML = "";
  }

  // ---------- 画面: 資格メニュー ----------
  function viewExam(examId) {
    var ex = DATA.exams[examId]; if (!ex) return go("#/");
    var s = examStats(examId), due = s.due, weak = weakIds(examId).length, bm = store.bm.filter(function (id) { return QMAP[id] && QMAP[id].exam === examId; }).length;
    var nd = nextDue(examId);
    var e = ex.exam;
    var cats = ex.categories.map(function (c) {
      var cs = catStats(examId, c.id);
      return '<button class="cat-row" data-cat="' + c.id + '"><div style="flex:1;min-width:0"><div class="nm">' + esc(c.name) + '</div><div class="sub">' + cs.total + "問 ・ 学習済み " + cs.seen + (cs.seen ? " ・ 正答率 " + cs.acc + "%" : "") + "</div></div>" +
        '<div class="bar">' + meter(pct(cs.seen, cs.total)) + '</div><span class="go">' + ICON.chev + "</span></button>";
    }).join("");
    app.innerHTML = '<div class="view">' + back("#/", "ホーム") +
      '<h1 class="page-title">' + esc(ex.name) + '</h1><p class="muted small" style="margin:0 0 14px">' + esc(ex.description) + "</p>" +
      '<div class="tiles"><div class="tile"><div class="k">学習済み</div><div class="v">' + s.seen + "<small>/ " + s.total + '</small></div></div><div class="tile"><div class="k">正答率</div><div class="v">' + (s.right + s.wrong ? s.acc : "–") + '<small>%</small></div></div><div class="tile"><div class="k">復習待ち</div><div class="v">' + due + '<small>問</small></div></div><div class="tile"><div class="k">ブックマーク</div><div class="v">' + bm + "<small>問</small></div></div></div>" +
      '<h2 class="section-title">学習モード</h2><div class="modes">' +
      '<button class="mode exam-mode wide" data-act="mock"><span class="mi">' + ICON.timer + '</span><span class="txt"><b>模擬試験（本番形式）</b><span>' + e.questions + "問・" + e.minutes + "分・" + esc(e.pass.label) + "</span></span></button>" +
      '<button class="mode" data-act="random10"><span class="mi">' + ICON.shuffle + "</span><b>ランダム10問</b><span>全分野からサクッと</span></button>" +
      '<button class="mode" data-act="random20"><span class="mi">' + ICON.shuffle + "</span><b>ランダム20問</b><span>未学習の問題を優先</span></button>" +
      '<button class="mode" data-act="review"' + (due ? "" : "") + '><span class="mi">' + ICON.repeat + "</span><b>復習</b><span>" + (due ? "間違えた問題を間隔反復で" : (isFinite(nd) ? "次の復習 " + fmtDate(nd) : "間違えた問題がここに入ります")) + "</span>" + (due ? '<span class="count">' + due + "</span>" : "") + "</button>" +
      '<button class="mode" data-act="weak"><span class="mi">' + ICON.target + "</span><b>苦手</b><span>" + (weak ? "間違えたことのある" + weak + "問" : "まだありません") + "</span></button>" +
      '<button class="mode" data-act="bm"><span class="mi">' + ICON.star + "</span><b>ブックマーク</b><span>" + (bm ? bm + "問を解く・一覧" : "★を付けた問題") + "</span></button>" +
      '<button class="mode" data-act="stats"><span class="mi">' + ICON.chart + "</span><b>進捗グラフ</b><span>日別・分野別・模試の推移</span></button>" +
      "</div>" +
      '<h2 class="section-title">分野別に解く</h2><div class="card" style="padding:4px 12px">' + cats + "</div>" +
      '<details class="panel"><summary>本番の試験形式（確認日 ' + esc(e.checked) + "）</summary><p class=\"small\" style=\"margin:0\">" + esc(e.note) + '</p><p class="small muted" style="margin:8px 0 0;word-break:break-all">出典: ' + e.source.split(" , ").map(function (u) { return '<a href="' + esc(u.trim()) + '" target="_blank" rel="noopener">' + esc(u.trim()) + "</a>"; }).join("<br>") + "</p></details>" +
      "</div>";
    $all(".cat-row", app).forEach(function (b) {
      b.onclick = function () {
        var ids = examQ(examId).filter(function (q) { return q.cat === b.dataset.cat; }).map(function (q) { return q.id; });
        startPractice(examId, prioritize(ids), catName(ex, b.dataset.cat));
      };
    });
    $all(".mode", app).forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.act, all = examQ(examId).map(function (q) { return q.id; });
        if (a === "mock") return go("#/mock/" + examId);
        if (a === "random10") return startPractice(examId, shuffle(all).slice(0, 10), "ランダム10問");
        if (a === "random20") return startPractice(examId, prioritize(all).slice(0, 20), "ランダム20問");
        if (a === "review") { var d = dueIds(examId); if (!d.length) return toast(isFinite(nd) ? "今日の復習はありません（次回 " + fmtDate(nd) + "）" : "復習する問題はまだありません"); return startPractice(examId, shuffle(d), "復習", true); }
        if (a === "weak") { var w = weakIds(examId); if (!w.length) return toast("まだ苦手な問題はありません"); return startPractice(examId, w.slice(0, 20), "苦手"); }
        if (a === "bm") return go("#/bookmarks/" + examId);
        if (a === "stats") return go("#/stats/" + examId);
      };
    });
  }
  /** 未学習 → 間違えた → その他 の順に、各グループ内はシャッフル */
  function prioritize(ids) {
    var unseen = [], wrong = [], rest = [];
    ids.forEach(function (id) { var r = store.q[id]; if (!r || !(r.r + r.w)) unseen.push(id); else if (r.ok === false) wrong.push(id); else rest.push(id); });
    return shuffle(unseen).concat(shuffle(wrong), shuffle(rest));
  }

  // ---------- 練習（即時採点） ----------
  var session = null;
  function startPractice(examId, ids, title, isReview) {
    if (!ids.length) return toast("出題できる問題がありません");
    session = { kind: "practice", exam: examId, ids: ids, idx: 0, title: title, review: !!isReview, results: {} };
    go("#/quiz");
  }
  function viewQuiz() {
    if (!session || session.kind !== "practice") return go("#/");
    document.body.classList.add("in-quiz");
    var ex = DATA.exams[session.exam], id = session.ids[session.idx], q = QMAP[id];
    var answered = session.results.hasOwnProperty(id), chosen = session.results[id];
    var n = session.ids.length;
    var html = '<div class="view">' +
      '<div class="qhead"><a class="icon-btn" href="#/exam/' + ex.id + '" aria-label="中断して戻る">' + ICON.x + '</a><div class="prog">' + meter(pct(session.idx + (answered ? 1 : 0), n)) + '</div><span class="num">' + (session.idx + 1) + " / " + n + "</span></div>" +
      '<div class="qcat">' + esc(session.title) + " ・ " + esc(catName(ex, q.cat)) + "</div>" +
      '<p class="qtext">' + esc(q.q) + "</p>" +
      '<ol class="choices">' + q.choices.map(function (c, i) {
        var cls = "choice";
        if (answered) { if (i === q.answer) cls += " correct"; else if (i === chosen) cls += " wrong"; }
        return '<li><button class="' + cls + '" data-i="' + i + '"' + (answered ? " disabled" : "") + '><span class="no">' + (i + 1) + "</span><span>" + esc(c) + "</span></button></li>";
      }).join("") + "</ol>";
    if (answered) {
      var ok = chosen === q.answer, refs = (ex.catMap[q.cat].refs || []);
      html += '<div class="feedback" role="status"><div class="verdict ' + (ok ? "ok" : "ng") + '">' + (ok ? ICON.check + "正解" : ICON.x + "不正解　正解は " + (q.answer + 1)) + "</div>" +
        "<p>" + esc(q.exp) + "</p>" + (refs.length ? '<div class="ref">根拠の確認先: ' + refs.map(esc).join(" / ") + "</div>" : "") + "</div>";
    }
    html += '<div class="qtools"><button class="bm-btn" aria-pressed="' + isBm(id) + '" id="bm">' + ICON.star + "ブックマーク</button><span class=\"spacer\"></span></div>";
    if (answered) html += '<div class="sticky-next"><button class="btn primary block" id="next">' + (session.idx + 1 < n ? "次の問題" : "結果を見る") + "</button></div>";
    else html += '<p class="kbd-hint">キーボード: 1〜4で解答 / Enterで次へ</p>';
    html += "</div>";
    app.innerHTML = html;
    $all(".choice", app).forEach(function (b) { b.onclick = function () { answerPractice(+b.dataset.i); }; });
    $("#bm").onclick = function () { var on = toggleBm(id); this.setAttribute("aria-pressed", on); toast(on ? "ブックマークしました" : "ブックマークを外しました"); };
    var nx = $("#next"); if (nx) { nx.onclick = nextPractice; nx.focus({ preventScroll: true }); }
  }
  function answerPractice(i) {
    var id = session.ids[session.idx], q = QMAP[id];
    if (session.results.hasOwnProperty(id)) return;
    session.results[id] = i;
    recordAnswer(q, i === q.answer); save();
    if (navigator.vibrate && i !== q.answer) { try { navigator.vibrate(30); } catch (e) {} }
    viewQuiz();
    var fb = $(".feedback"); if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function nextPractice() {
    if (session.idx + 1 < session.ids.length) { session.idx++; viewQuiz(); window.scrollTo(0, 0); }
    else go("#/quiz-result");
  }
  function viewQuizResult() {
    if (!session || session.kind !== "practice") return go("#/");
    var ex = DATA.exams[session.exam];
    var ids = session.ids.filter(function (id) { return session.results.hasOwnProperty(id); });
    var ok = ids.filter(function (id) { return session.results[id] === QMAP[id].answer; });
    var ng = ids.filter(function (id) { return session.results[id] !== QMAP[id].answer; });
    app.innerHTML = '<div class="view">' + back("#/exam/" + ex.id, ex.short + "メニュー") +
      '<div class="card result-hero"><div class="muted small">' + esc(session.title) + '</div><div class="score">' + ok.length + "<small> / " + ids.length + '</small></div><div class="muted">正答率 ' + pct(ok.length, ids.length) + "%</div></div>" +
      '<div class="row" style="margin-top:12px">' + (ng.length ? '<button class="btn primary" id="retry-ng">間違えた' + ng.length + "問をもう一度</button>" : "") + '<a class="btn" href="#/exam/' + ex.id + '">メニューへ</a></div>' +
      '<h2 class="section-title">ふりかえり</h2><div class="card">' + reviewList(ids, session.results) + "</div></div>";
    var r = $("#retry-ng"); if (r) r.onclick = function () { startPractice(ex.id, shuffle(ng), "間違えた問題"); };
  }
  function reviewList(ids, answers, onlyWrong) {
    var html = ids.map(function (id, n) {
      var q = QMAP[id], a = answers[id], has = a !== undefined && a !== null, ok = has && a === q.answer;
      if (onlyWrong && ok) return "";
      return '<div class="rv-item"><div class="h"><span class="mark ' + (ok ? "ok" : has ? "ng" : "na") + '">' + (ok ? "○" : has ? "×" : "–") + "</span><span>" + (n + 1) + ". " + esc(q.q) + "</span></div>" +
        '<div class="a">正解: <b>' + esc(q.choices[q.answer]) + "</b>" + (has && !ok ? "　/　あなたの解答: " + esc(q.choices[a]) : !has ? "　/　未解答" : "") + "</div>" +
        '<div class="e">' + esc(q.exp) + "</div></div>";
    }).join("");
    return html || '<div class="empty">表示する問題はありません。</div>';
  }

  // ---------- 模擬試験 ----------
  var MOCK_KEY = "shikaku-drill:mock";
  var mock = null, tick = null;
  try { mock = JSON.parse(localStorage.getItem(MOCK_KEY) || "null"); } catch (e) { mock = null; }
  function saveMock() { try { if (mock) localStorage.setItem(MOCK_KEY, JSON.stringify(mock)); else localStorage.removeItem(MOCK_KEY); } catch (e) {} }

  function buildMock(examId) {
    var ex = DATA.exams[examId], e = ex.exam, ids = [];
    if (e.distribution) {
      ex.categories.forEach(function (c) {
        var n = e.distribution[c.id] || 0;
        ids = ids.concat(shuffle(ex.questions.filter(function (q) { return q.cat === c.id; })).slice(0, n).map(function (q) { return q.id; }));
      });
    } else {
      ids = shuffle(ex.questions).slice(0, e.questions).map(function (q) { return q.id; });
      var order = ex.categories.map(function (c) { return c.id; });
      ids.sort(function (a, b) { return order.indexOf(QMAP[a].cat) - order.indexOf(QMAP[b].cat); });
    }
    return ids;
  }
  function viewMockIntro(examId) {
    var ex = DATA.exams[examId]; if (!ex) return go("#/");
    var e = ex.exam, resumable = mock && mock.exam === examId && !mock.done;
    var dist = e.distribution ? ex.categories.map(function (c) { return esc(c.name) + " " + e.distribution[c.id] + "問"; }).join(" ・ ") : "全分野からランダム";
    app.innerHTML = '<div class="view">' + back("#/exam/" + examId, ex.short + "メニュー") +
      '<h1 class="page-title">模擬試験</h1><p class="muted small" style="margin:0 0 14px">' + esc(ex.name) + "</p>" +
      '<div class="card stack"><div class="tiles"><div class="tile"><div class="k">問題数</div><div class="v">' + e.questions + '<small>問</small></div></div><div class="tile"><div class="k">制限時間</div><div class="v">' + e.minutes + '<small>分</small></div></div></div>' +
      '<div><b>合格ライン</b><br>' + esc(e.pass.label) + '</div><div class="small"><b>出題配分</b><br>' + dist + '</div><div class="small muted">' + esc(e.note) + "</div>" +
      '<div class="small muted">途中でアプリを閉じても、時間内なら続きから再開できます。時間切れになると自動で採点します。</div></div>' +
      '<div class="row" style="margin-top:14px">' + (resumable ? '<button class="btn primary" id="resume">続きから再開</button>' : "") + '<button class="btn ' + (resumable ? "" : "primary") + '" id="start">' + (resumable ? "新しく始める" : "開始する") + "</button></div></div>";
    if (resumable) $("#resume").onclick = function () { go("#/mock-run"); };
    $("#start").onclick = function () {
      if (resumable && !confirm("途中の模擬試験を破棄して新しく始めますか？")) return;
      var now = Date.now();
      mock = { exam: examId, ids: buildMock(examId), answers: {}, flags: {}, idx: 0, start: now, deadline: now + e.minutes * 60000, done: false };
      saveMock(); go("#/mock-run");
    };
  }
  function viewMockRun() {
    if (!mock || mock.done) return go("#/");
    if (Date.now() >= mock.deadline) return finishMock(true);
    document.body.classList.add("in-quiz");
    var ex = DATA.exams[mock.exam], id = mock.ids[mock.idx], q = QMAP[id], n = mock.ids.length;
    var answeredCount = Object.keys(mock.answers).length;
    app.innerHTML = '<div class="view">' +
      '<div class="qhead"><a class="icon-btn" href="#/mock/' + ex.id + '" aria-label="一時中断">' + ICON.x + '</a><div class="prog">' + meter(pct(answeredCount, n)) + '</div><span class="timer" id="timer" aria-live="off">' + fmtTime((mock.deadline - Date.now()) / 1000) + "</span></div>" +
      '<div class="qcat">問' + (mock.idx + 1) + " / " + n + " ・ " + esc(catName(ex, q.cat)) + "</div>" +
      '<p class="qtext">' + esc(q.q) + "</p>" +
      '<ol class="choices">' + q.choices.map(function (c, i) {
        return '<li><button class="choice' + (mock.answers[id] === i ? " sel" : "") + '" data-i="' + i + '" aria-pressed="' + (mock.answers[id] === i) + '"><span class="no">' + (i + 1) + "</span><span>" + esc(c) + "</span></button></li>";
      }).join("") + "</ol>" +
      '<div class="qtools"><button class="bm-btn" id="flag" aria-pressed="' + !!mock.flags[id] + '">' + ICON.flag + "見直し</button><span class=\"spacer\"></span>" +
      '<button class="btn" id="prev"' + (mock.idx ? "" : " disabled") + ">前へ</button><button class=\"btn primary\" id=\"nxt\">" + (mock.idx + 1 < n ? "次へ" : "最後の問題") + "</button></div>" +
      '<details class="panel" id="navp"><summary>問題一覧（解答済み ' + answeredCount + " / " + n + '）</summary><div class="navgrid">' +
      mock.ids.map(function (qid, i) { return '<button data-j="' + i + '" class="' + (mock.answers[qid] !== undefined ? "ans " : "") + (mock.flags[qid] ? "flag " : "") + (i === mock.idx ? "cur" : "") + '" aria-label="問' + (i + 1) + '">' + (i + 1) + "</button>"; }).join("") +
      '</div></details><div class="sticky-next"><button class="btn block" id="submit">採点する</button></div></div>';
    $all(".choice", app).forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.i;
        if (mock.answers[id] === i) delete mock.answers[id]; else mock.answers[id] = i;
        saveMock(); viewMockRun();
      };
    });
    $("#flag").onclick = function () { mock.flags[id] = !mock.flags[id]; saveMock(); viewMockRun(); };
    $("#prev").onclick = function () { if (mock.idx) { mock.idx--; saveMock(); viewMockRun(); window.scrollTo(0, 0); } };
    $("#nxt").onclick = function () { if (mock.idx + 1 < n) { mock.idx++; saveMock(); viewMockRun(); window.scrollTo(0, 0); } else { var p = $("#navp"); p.open = true; p.scrollIntoView({ behavior: "smooth" }); } };
    $all(".navgrid button", app).forEach(function (b) { b.onclick = function () { mock.idx = +b.dataset.j; saveMock(); viewMockRun(); window.scrollTo(0, 0); }; });
    $("#submit").onclick = function () {
      var left = n - Object.keys(mock.answers).length;
      if (confirm(left ? "未解答が" + left + "問あります。採点しますか？" : "採点しますか？")) finishMock(false);
    };
    startTick();
  }
  function startTick() {
    stopTick();
    tick = setInterval(function () {
      if (!mock || mock.done) return stopTick();
      var left = (mock.deadline - Date.now()) / 1000, el = $("#timer");
      if (left <= 0) { stopTick(); toast("時間切れです。採点します"); return finishMock(true); }
      if (el) { el.textContent = fmtTime(left); el.classList.toggle("low", left < 300); }
    }, 1000);
  }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function judge(ex, ids, answers) {
    var e = ex.exam, cats = {}, ok = 0;
    ids.forEach(function (id) {
      var q = QMAP[id], c = cats[q.cat] || (cats[q.cat] = [0, 0]);
      c[1]++; if (answers[id] === q.answer) { c[0]++; ok++; }
    });
    var pass;
    if (e.pass.type === "perCategory") pass = Object.keys(cats).every(function (k) { return cats[k][0] >= Math.ceil(cats[k][1] * e.pass.ratio - 1e-9); });
    else pass = ok >= Math.ceil(ids.length * e.pass.ratio - 1e-9);
    return { ok: ok, total: ids.length, cats: cats, pass: pass };
  }
  function finishMock(timeout) {
    stopTick();
    if (!mock || mock.done) return;
    var ex = DATA.exams[mock.exam], now = Date.now();
    var res = judge(ex, mock.ids, mock.answers);
    mock.ids.forEach(function (id) { if (mock.answers[id] !== undefined) recordAnswer(QMAP[id], mock.answers[id] === QMAP[id].answer, now); });
    store.mocks.push({ e: ex.id, t: now, ok: res.ok, n: res.total, pass: res.pass, cats: res.cats, secs: Math.round((Math.min(now, mock.deadline) - mock.start) / 1000), timeout: !!timeout });
    if (store.mocks.length > 200) store.mocks = store.mocks.slice(-200);
    save();
    mock.done = true; mock.result = res; mock.finishedAt = now; saveMock();
    go("#/mock-result");
  }
  function viewMockResult() {
    if (!mock || !mock.done) return go("#/");
    var ex = DATA.exams[mock.exam], res = mock.result, e = ex.exam;
    var cats = ex.categories.filter(function (c) { return res.cats[c.id]; }).map(function (c) {
      var v = res.cats[c.id], need = Math.ceil(v[1] * e.pass.ratio - 1e-9), good = v[0] >= need;
      return '<div class="r"><span>' + esc(c.name) + '</span><span><b>' + v[0] + "</b> / " + v[1] + (e.pass.type === "perCategory" ? '　<span class="' + (good ? "muted" : "") + '" style="color:' + (good ? "var(--ok)" : "var(--ng)") + '">' + (good ? "基準クリア" : "あと" + (need - v[0]) + "問") + "</span>" : "") + "</span>" + meter(pct(v[0], v[1]), e.pass.type === "perCategory" ? (good ? "ok" : "ng") : "") + "</div>";
    }).join("");
    var used = Math.round((Math.min(mock.finishedAt, mock.deadline) - mock.start) / 1000);
    var needTotal = Math.ceil(res.total * e.pass.ratio - 1e-9);
    app.innerHTML = '<div class="view">' + back("#/exam/" + ex.id, ex.short + "メニュー") +
      '<div class="card result-hero"><div class="muted small">模擬試験 ・ ' + esc(ex.name) + '</div><div class="score">' + res.ok + "<small> / " + res.total + "</small></div>" +
      '<div class="muted">正答率 ' + pct(res.ok, res.total) + "% ・ 所要 " + fmtTime(used) + "</div>" +
      '<div class="verdict-badge ' + (res.pass ? "pass" : "fail") + '">' + (res.pass ? "合格ライン到達" : "不合格ライン") + "</div>" +
      '<div class="small muted" style="margin-top:8px">合格基準: ' + esc(e.pass.label) + (e.pass.type === "total" ? "（" + needTotal + "問以上）" : "") + "</div></div>" +
      '<h2 class="section-title">分野別の得点</h2><div class="card catres">' + cats + "</div>" +
      '<div class="row" style="margin-top:14px"><a class="btn primary" href="#/mock/' + ex.id + '">もう一度受ける</a><a class="btn" href="#/stats/' + ex.id + '">推移を見る</a></div>' +
      '<h2 class="section-title">解答と解説</h2><div class="seg" role="group" aria-label="表示切替"><button aria-pressed="true" data-f="all">すべて</button><button aria-pressed="false" data-f="ng">間違い・未解答のみ</button></div>' +
      '<div class="card" style="margin-top:10px" id="rv">' + reviewList(mock.ids, mock.answers) + "</div></div>";
    $all(".seg button", app).forEach(function (b) {
      b.onclick = function () {
        $all(".seg button", app).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        $("#rv").innerHTML = reviewList(mock.ids, mock.answers, b.dataset.f === "ng");
      };
    });
  }

  // ---------- 進捗グラフ（インラインSVG） ----------
  function chartDaily(examId) {
    var W = 340, H = 170, pl = 28, pr = 30, pt = 12, pb = 26, days = 14, now = Date.now();
    var rows = [];
    for (var i = days - 1; i >= 0; i--) { var k = todayKey(now - i * DAY), v = (store.log[examId] || {})[k] || [0, 0]; rows.push({ k: k, n: v[0], ok: v[1] }); }
    var maxN = Math.max(4, Math.max.apply(null, rows.map(function (r) { return r.n; })));
    maxN = Math.ceil(maxN / 4) * 4; // 目盛りを整数にする
    var cw = (W - pl - pr) / days, ih = H - pt - pb;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="直近14日の解答数と正答率">';
    for (var g = 0; g <= 4; g++) { var y = pt + ih * g / 4; s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/>'; s += '<text x="' + (pl - 4) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(maxN * (1 - g / 4)) + "</text>"; s += '<text x="' + (W - pr + 4) + '" y="' + (y + 4) + '">' + (100 - g * 25) + "%</text>"; }
    var pts = [];
    rows.forEach(function (r, i) {
      var x = pl + cw * i, bh = ih * r.n / maxN;
      s += '<rect class="bar" x="' + (x + cw * 0.18).toFixed(1) + '" y="' + (pt + ih - bh).toFixed(1) + '" width="' + (cw * 0.64).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2"><title>' + r.k + " " + r.n + "問 正答" + r.ok + "</title></rect>";
      if (r.n) pts.push([x + cw / 2, pt + ih * (1 - r.ok / r.n)]);
      if ((days - 1 - i) % 2 === 0) s += '<text x="' + (x + cw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + Number(r.k.slice(5, 7)) + "/" + Number(r.k.slice(8)) + "</text>";
    });
    if (pts.length > 1) s += '<polyline class="line" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>';
    pts.forEach(function (p) { s += '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>'; });
    return s + "</svg>";
  }
  function chartCats(examId) {
    var ex = DATA.exams[examId], W = 340, rowH = 34, pl = 0, H = ex.categories.length * rowH + 6;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="分野別の正答率">';
    ex.categories.forEach(function (c, i) {
      var cs = catStats(examId, c.id), y = i * rowH, bw = W - 56, has = cs.right + cs.wrong;
      s += '<text x="' + pl + '" y="' + (y + 12) + '" style="fill:var(--text);font-weight:700">' + esc(c.short || c.name) + "</text>";
      s += '<rect x="0" y="' + (y + 17) + '" width="' + bw + '" height="9" rx="4.5" style="fill:var(--surface-2)"/>';
      s += '<rect x="0" y="' + (y + 17) + '" width="' + (bw * pct(cs.seen, cs.total) / 100).toFixed(1) + '" height="9" rx="4.5" style="fill:var(--primary);opacity:.25"/>';
      s += '<rect x="0" y="' + (y + 17) + '" width="' + (has ? bw * cs.acc / 100 : 0).toFixed(1) + '" height="9" rx="4.5" style="fill:var(--primary)"/>';
      s += '<text x="' + W + '" y="' + (y + 26) + '" text-anchor="end" style="fill:var(--text);font-weight:700">' + (has ? cs.acc + "%" : "–") + "</text>";
    });
    return s + "</svg>";
  }
  function chartMocks(examId) {
    var list = store.mocks.filter(function (m) { return m.e === examId; }).slice(-12);
    if (!list.length) return '<div class="empty">模擬試験を受けると、ここに得点の推移が表示されます。</div>';
    var ex = DATA.exams[examId], W = 340, H = 160, pl = 30, pr = 10, pt = 12, pb = 24, ih = H - pt - pb, iw = W - pl - pr;
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="模擬試験の得点率の推移">';
    for (var g = 0; g <= 4; g++) { var y = pt + ih * g / 4; s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 4) + '" y="' + (y + 4) + '" text-anchor="end">' + (100 - g * 25) + "%</text>"; }
    var py = pt + ih * (1 - ex.exam.pass.ratio);
    s += '<line class="passline" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + py + '" y2="' + py + '"/>';
    var step = list.length > 1 ? iw / (list.length - 1) : 0;
    var pts = list.map(function (m, i) { return [pl + (list.length > 1 ? step * i : iw / 2), pt + ih * (1 - m.ok / m.n), m]; });
    if (pts.length > 1) s += '<polyline class="line" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>';
    pts.forEach(function (p, i) {
      s += '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" style="stroke:' + (p[2].pass ? "var(--ok)" : "var(--ng)") + '"><title>' + fmtDate(p[2].t) + " " + p[2].ok + "/" + p[2].n + "</title></circle>";
      if (list.length <= 6 || i % 2 === 0 || i === pts.length - 1) s += '<text x="' + p[0].toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtDate(p[2].t) + "</text>";
    });
    return s + "</svg>";
  }
  function viewStats(examId) {
    var ex = DATA.exams[examId]; if (!ex) return go("#/");
    var s = examStats(examId), mocks = store.mocks.filter(function (m) { return m.e === examId; });
    var best = mocks.reduce(function (b, m) { return Math.max(b, pct(m.ok, m.n)); }, 0);
    app.innerHTML = '<div class="view">' + back("#/exam/" + examId, ex.short + "メニュー") +
      '<h1 class="page-title">進捗グラフ</h1><p class="muted small" style="margin:0 0 14px">' + esc(ex.name) + "</p>" +
      '<div class="tiles"><div class="tile"><div class="k">学習済み</div><div class="v">' + pct(s.seen, s.total) + '<small>%</small></div></div><div class="tile"><div class="k">総解答数</div><div class="v">' + (s.right + s.wrong) + '<small>回</small></div></div><div class="tile"><div class="k">正答率</div><div class="v">' + (s.right + s.wrong ? s.acc : "–") + '<small>%</small></div></div><div class="tile"><div class="k">模試ベスト</div><div class="v">' + (mocks.length ? best : "–") + "<small>%</small></div></div></div>" +
      '<h2 class="section-title">直近14日</h2><div class="card">' + chartDaily(examId) + '<div class="legend"><span><i style="background:var(--primary)"></i>解答数</span><span><i style="background:var(--c-otsu4)"></i>正答率</span></div></div>' +
      '<h2 class="section-title">分野別の正答率</h2><div class="card">' + chartCats(examId) + '<div class="legend"><span><i style="background:var(--primary)"></i>正答率</span><span><i style="background:var(--primary);opacity:.25"></i>学習済みの割合</span></div></div>' +
      '<h2 class="section-title">模擬試験の推移（' + mocks.length + "回）</h2><div class=\"card\">" + chartMocks(examId) + (mocks.length ? '<div class="legend"><span><i style="background:var(--ok)"></i>合格ライン（' + Math.round(ex.exam.pass.ratio * 100) + "%）</span></div>" : "") + "</div></div>";
  }

  // ---------- ブックマーク ----------
  function viewBookmarks(examId) {
    var ex = DATA.exams[examId]; if (!ex) return go("#/");
    var ids = store.bm.filter(function (id) { return QMAP[id] && QMAP[id].exam === examId; });
    app.innerHTML = '<div class="view">' + back("#/exam/" + examId, ex.short + "メニュー") +
      '<h1 class="page-title">ブックマーク</h1><p class="muted small" style="margin:0 0 14px">' + esc(ex.name) + " ・ " + ids.length + "問</p>" +
      (ids.length ? '<button class="btn primary block" id="solve">ブックマークした問題を解く</button><div class="card" style="margin-top:12px">' +
        ids.map(function (id) { var q = QMAP[id]; return '<div class="rv-item"><div class="h"><span style="flex:1">' + esc(q.q) + '</span><button class="bm-btn" data-id="' + id + '" aria-pressed="true" aria-label="ブックマーク解除">' + ICON.star + "</button></div><div class=\"a\" style=\"margin-left:0\">正解: <b>" + esc(q.choices[q.answer]) + '</b></div><div class="e" style="margin-left:0">' + esc(q.exp) + "</div></div>"; }).join("") + "</div>"
        : '<div class="card empty">問題画面の「★ブックマーク」で、あとで見返したい問題を保存できます。</div>') + "</div>";
    var b = $("#solve"); if (b) b.onclick = function () { startPractice(examId, shuffle(ids), "ブックマーク"); };
    $all(".bm-btn[data-id]", app).forEach(function (x) { x.onclick = function () { toggleBm(x.dataset.id); viewBookmarks(examId); }; });
  }

  // ---------- 設定 ----------
  function viewSettings() {
    var t = store.settings.theme || "system";
    app.innerHTML = '<div class="view">' + back("#/", "ホーム") + '<h1 class="page-title">設定・データ</h1>' +
      '<h2 class="section-title">表示</h2><div class="card"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><b style="flex:1">テーマ</b><div class="seg" role="group" aria-label="テーマ">' +
      [["system", "端末に合わせる"], ["light", "ライト"], ["dark", "ダーク"]].map(function (o) { return '<button data-t="' + o[0] + '" aria-pressed="' + (t === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div></div>" +
      '<h2 class="section-title">学習データ</h2><div class="card stack"><p class="small muted" style="margin:0">学習記録はこの端末のブラウザ内（localStorage）にだけ保存され、サーバーには送信されません。機種変更の際は書き出し→読み込みで移せます。</p>' +
      '<div class="row"><button class="btn" id="exp">書き出し（JSON）</button><label class="btn" for="imp">読み込み<input type="file" id="imp" accept="application/json,.json" class="sr-only"></label></div>' +
      '<button class="btn block" id="reset" style="color:var(--ng)">学習データをすべて消去</button></div>' +
      '<h2 class="section-title">復習（間隔反復）のしくみ</h2><div class="card small">間違えた問題はすぐ「復習」に入ります。復習で正解するたびに、次の出題が <b>' + INTERVALS.join("日 → ") + '日</b> 後へ延び、最後まで正解し続けると「習得済み」として復習から外れます。途中で間違えると最初からやり直しです。</div>' +
      '<p class="small muted" style="margin-top:16px">アプリ版 ' + esc(DATA.index.version) + "</p></div>";
    $all(".seg button", app).forEach(function (b) { b.onclick = function () { store.settings.theme = b.dataset.t; save(); applyTheme(); viewSettings(); }; });
    $("#exp").onclick = function () {
      var blob = new Blob([JSON.stringify({ app: "shikaku-drill", v: 1, exported: new Date().toISOString(), data: store }, null, 1)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "shikaku-drill-" + todayKey() + ".json"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    $("#imp").onchange = function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var j = JSON.parse(rd.result), d = j && j.data;
          if (!d || typeof d.q !== "object") throw new Error("bad");
          if (!confirm("現在の学習データを読み込んだデータで置き換えますか？")) return;
          localStorage.setItem(STORE_KEY, JSON.stringify(d)); store = loadStore(); applyTheme(); toast("読み込みました"); viewSettings();
        } catch (e) { toast("ファイルの形式が正しくありません"); }
      };
      rd.readAsText(f);
    };
    $("#reset").onclick = function () {
      if (!confirm("学習記録・ブックマーク・模試の履歴をすべて消去します。元に戻せません。よろしいですか？")) return;
      store = { q: {}, bm: [], log: {}, mocks: [], settings: store.settings }; save(); mock = null; saveMock(); toast("消去しました"); viewSettings();
    };
  }

  // ---------- このアプリについて ----------
  function viewAbout() {
    var srcs = EXAMS.map(function (ex) {
      return "<li><b>" + esc(ex.name) + "</b>（試験形式の確認日 " + esc(ex.exam.checked) + "）<ul class=\"list-plain\">" +
        ex.exam.source.split(" , ").map(function (u) { return '<li><a href="' + esc(u.trim()) + '" target="_blank" rel="noopener">' + esc(u.trim()) + "</a></li>"; }).join("") +
        ex.categories.map(function (c) { return "<li>" + esc(c.name) + "：" + (c.refs || []).map(esc).join(" / ") + "</li>"; }).join("") + "</ul></li>";
    }).join("");
    app.innerHTML = '<div class="view">' + back("#/", "ホーム") + '<h1 class="page-title">このアプリについて</h1>' +
      '<div class="card stack"><p style="margin:0">「資格ドリル」は、工業系の国家資格を勉強する人のための<b>無料・非公式</b>の学習アプリです。広告や会員登録なしで、すべての機能を使えます（将来、広告枠を設ける場合があります）。</p>' +
      '<div class="notice"><b>免責事項：</b>本アプリは各試験の実施団体・官公庁とは一切関係のない非公式アプリです。問題・解説・試験情報について、内容の正確性は保証しません（最新であることも保証しません）。本アプリの利用により生じた損害について責任を負いません。法令・試験制度は改正されることがあるため、必ず<b>最新の公式情報</b>（受験案内・法令原文）を確認してください。</div>' +
      "<p style=\"margin:0\">問題はすべて、法令（e-Gov法令検索）、試験実施団体の公表資料、官公庁の解説資料などで事実を確認したうえで書き起こした<b>オリジナル問題</b>です。過去問の文章は使用していません。本番の形式と異なる点（乙4は本番五肢択一、2級電気通信は選択解答制、電工二種の配線図問題は文章で代用など）があります。</p></div>" +
      '<h2 class="section-title">主な出典・確認先</h2><div class="card src-list"><ul class="list-plain">' + srcs + "</ul></div>" +
      '<h2 class="section-title">プライバシー</h2><div class="card small">学習記録は端末内（localStorage）にのみ保存され、外部に送信されません。アクセス解析・広告タグは現在使用していません。</div>' +
      '<p class="small muted" style="margin-top:16px">誤りを見つけたら、作者のページからお知らせいただけると助かります。</p></div>';
  }

  // ---------- ルーター ----------
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    stopTick();
    document.body.classList.remove("in-quiz");
    var h = location.hash.replace(/^#/, "") || "/";
    var p = h.split("/").filter(Boolean);
    window.scrollTo(0, 0);
    if (!p.length) return viewHome();
    switch (p[0]) {
      case "exam": return viewExam(p[1]);
      case "quiz": return viewQuiz();
      case "quiz-result": return viewQuizResult();
      case "mock": return viewMockIntro(p[1]);
      case "mock-run": return viewMockRun();
      case "mock-result": return viewMockResult();
      case "stats": return viewStats(p[1]);
      case "bookmarks": return viewBookmarks(p[1]);
      case "settings": return viewSettings();
      case "about": return viewAbout();
      default: return viewHome();
    }
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    var h = location.hash;
    if (/^[1-4]$/.test(e.key)) {
      var b = $('.choice[data-i="' + (Number(e.key) - 1) + '"]');
      if (b && !b.disabled && (h === "#/quiz" || h === "#/mock-run")) { e.preventDefault(); b.click(); }
    } else if (e.key === "Enter" && h === "#/quiz") {
      var n = $("#next"); if (n && document.activeElement !== n) { e.preventDefault(); n.click(); }
    } else if (h === "#/mock-run" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      var t = $(e.key === "ArrowRight" ? "#nxt" : "#prev"); if (t && !t.disabled) t.click();
    }
  });
  window.addEventListener("storage", function (e) { if (e.key === STORE_KEY) store = loadStore(); });

  // テスト用フック（本番動作には影響なし）
  window.__shikaku = { store: function () { return store; }, recordAnswer: recordAnswer, judge: judge, INTERVALS: INTERVALS, isDue: isDue };

  route();

  // ---------- Service Worker ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing;
          if (nw) nw.addEventListener("statechange", function () { if (nw.state === "installed" && navigator.serviceWorker.controller) toast("新しいバージョンがあります。再読み込みで更新されます"); });
        });
      }).catch(function () {});
    });
  }
})();
