#!/usr/bin/env node
/* ヘッドレスブラウザでの動作確認（playwright-core + Chromium が必要）
   使い方: PW=/path/to/node_modules/playwright-core CHROME=/usr/bin/chromium node tools/e2e-test.js [出力先フォルダ]
   ローカルサーバー(127.0.0.1・空きポート)を自動で起動してテストします。 */
"use strict";
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require(process.env.PW || "playwright-core");
const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "..", "shikaku-test-shots");
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

let pass = 0, failN = 0;
function check(cond, msg) { if (cond) { pass++; console.log("  ✓ " + msg); } else { failN++; console.log("  ✗ " + msg); } }

(async () => {
  await new Promise((r) => server.listen(Number(process.env.PORT || 0), "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ja-JP" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());

  console.log("ホーム");
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector(".exam-card");
  check((await page.$$(".exam-card")).length === 3, "資格カードが3つ表示される");
  check(/非公式/.test(await page.textContent("body")), "非公式の表示がある");
  check(await page.$('footer a[href="../"]') !== null, "フッターに ../ へのリンク（made by atalabo）");
  const html = await page.content();
  check(html.includes("<!-- AdSense -->"), "AdSense プレースホルダのコメントがある");
  await page.screenshot({ path: path.join(OUT, "01-home-light.png"), fullPage: true });

  console.log("練習モード（ランダム10問）");
  await page.click('a[href="#/exam/denko2"]');
  await page.waitForSelector(".mode");
  await page.screenshot({ path: path.join(OUT, "02-exam-menu.png"), fullPage: true });
  await page.click('[data-act="random10"]');
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector(".choice:not([disabled])");
    if (i === 0) await page.screenshot({ path: path.join(OUT, "03-question.png"), fullPage: true });
    await page.click(i % 2 ? '.choice[data-i="0"]' : '.choice[data-i="3"]');
    await page.waitForSelector(".feedback");
    if (i === 0) await page.screenshot({ path: path.join(OUT, "04-feedback.png"), fullPage: true });
    await page.click("#next");
  }
  await page.waitForSelector(".result-hero");
  check(/\/ 10/.test(await page.textContent(".result-hero")), "10問の結果が表示される");
  const st = await page.evaluate(() => window.__shikaku.store());
  check(Object.keys(st.q).length === 10, "10問分の解答が localStorage に記録される");
  const wrongN = Object.values(st.q).filter((r) => r.w > 0).length;
  check(wrongN === Object.values(st.q).filter((r) => r.box === 0).length, "間違えた問題が復習（box=0）に入る");

  console.log("間隔反復ロジック");
  const srs = await page.evaluate(() => {
    const S = window.__shikaku, q = window.SHIKAKU_DATA.exams.otsu4.questions[0], DAY = 86400000, t0 = Date.now();
    S.recordAnswer(q, false, t0);
    const r = S.store().q[q.id], out = [r.box, S.isDue(q.id, t0)];
    S.recordAnswer(q, true, t0); out.push(r.box, Math.round((r.due - t0) / DAY));
    S.recordAnswer(q, true, t0 + DAY); out.push(r.box, Math.round((r.due - t0 - DAY) / DAY));
    S.recordAnswer(q, false, t0 + 2 * DAY); out.push(r.box);
    for (let i = 0; i < 7; i++) S.recordAnswer(q, true, t0 + (3 + i) * DAY);
    out.push(r.box === undefined && r.due === null && !!r.mastered);
    return out;
  });
  check(srs[0] === 0 && srs[1] === true, "不正解で box=0・即復習対象");
  check(srs[2] === 1 && srs[3] === 1, "正解1回目で1日後");
  check(srs[4] === 2 && srs[5] === 3, "正解2回目で3日後");
  check(srs[6] === 0, "途中で間違えると最初から");
  check(srs[7] === true, "6段階を正解し続けると習得済みで復習から外れる");

  console.log("合否判定ロジック");
  const jd = await page.evaluate(() => {
    const S = window.__shikaku, D = window.SHIKAKU_DATA.exams;
    const mk = (ex, perCat) => { const ids = [], ans = {}; Object.entries(perCat).forEach(([c, [ok, n]]) => { D[ex].questions.filter((q) => q.cat === c).slice(0, n).forEach((q, i) => { ids.push(q.id); ans[q.id] = i < ok ? q.answer : (q.answer + 1) % 4; }); }); return S.judge(D[ex], ids, ans); };
    return [
      mk("otsu4", { hourei: [9, 15], butsuka: [6, 10], seishitsu: [6, 10] }).pass,
      mk("otsu4", { hourei: [15, 15], butsuka: [5, 10], seishitsu: [10, 10] }).pass,
      mk("tsushin2", { kogaku: [9, 9], setsubi: [7, 7], kanren: [4, 4], sekou: [4, 13], hoki: [0, 7] }).pass,
      mk("tsushin2", { kogaku: [9, 9], setsubi: [7, 7], kanren: [4, 4], sekou: [3, 13], hoki: [0, 7] }).pass
    ];
  });
  check(jd[0] === true, "乙4: 各科目ちょうど60%で合格");
  check(jd[1] === false, "乙4: 1科目でも60%未満なら不合格（合計30/35でも）");
  check(jd[2] === true && jd[3] === false, "2級電通: 24/40で合格・23/40で不合格");

  console.log("模擬試験（乙4）");
  await page.goto(base + "#/mock/otsu4");
  await page.waitForSelector("#start");
  await page.click("#start");
  await page.waitForSelector("#timer");
  check(/^\d+:\d{2}:\d{2}$/.test((await page.textContent("#timer")).trim()), "タイマーが表示される（2時間）");
  check((await page.$$(".navgrid button")).length === 35, "35問が出題される");
  for (let i = 0; i < 5; i++) { await page.click('.choice[data-i="1"]'); await page.click("#nxt"); }
  await page.click("#flag");
  await page.screenshot({ path: path.join(OUT, "05-mock-run.png"), fullPage: true });
  await page.reload(); await page.waitForSelector("#timer");
  check((await page.$$(".navgrid button.ans")).length === 5, "再読み込みしても模試の途中経過が残る");
  await page.click("#submit");
  await page.waitForSelector(".verdict-badge");
  check((await page.$$(".catres .r")).length === 3, "科目別（3科目）の得点が出る");
  check(/不合格ライン/.test(await page.textContent(".verdict-badge")), "5問解答では不合格判定");
  await page.screenshot({ path: path.join(OUT, "06-mock-result.png"), fullPage: true });
  await page.click('.seg button[data-f="ng"]');
  check((await page.$$("#rv .rv-item")).length >= 30, "間違い・未解答のみ表示に切り替わる");

  console.log("進捗グラフ・ブックマーク");
  await page.goto(base + "#/stats/denko2");
  await page.waitForSelector("svg.chart");
  check((await page.$$("svg.chart")).length >= 2, "SVGグラフが描画される");
  await page.goto(base + "#/stats/otsu4");
  await page.waitForSelector("svg.chart");
  check((await page.$$("svg.chart")).length === 3, "模試の推移グラフも描画される");
  await page.screenshot({ path: path.join(OUT, "07-stats.png"), fullPage: true });
  await page.goto(base + "#/exam/tsushin2"); await page.waitForSelector(".mode");
  await page.click('[data-act="random10"]'); await page.waitForSelector("#bm");
  await page.click("#bm");
  await page.goto(base + "#/bookmarks/tsushin2"); await page.waitForSelector("#solve");
  check((await page.$$(".rv-item")).length === 1, "ブックマークした問題が一覧に出る");

  console.log("ダークモード・設定・このアプリについて");
  await page.goto(base + "#/");
  await page.waitForSelector(".exam-card");
  const before = await page.getAttribute("html", "data-theme");
  await page.click("#theme-btn");
  const after = await page.getAttribute("html", "data-theme");
  check(before !== after && after === "dark", "ダークモードに切り替わる");
  await page.screenshot({ path: path.join(OUT, "08-home-dark.png"), fullPage: true });
  await page.goto(base + "#/exam/otsu4"); await page.waitForSelector(".mode");
  await page.click('[data-act="random10"]'); await page.waitForSelector(".choice"); await page.click('.choice[data-i="0"]'); await page.waitForSelector(".feedback");
  await page.screenshot({ path: path.join(OUT, "09-question-dark.png"), fullPage: true });
  await page.goto(base + "#/about"); await page.waitForSelector(".src-list");
  check(/正確性は保証しません/.test(await page.textContent("main")) && /最新の公式情報/.test(await page.textContent("main")), "免責（正確性非保証・公式情報の確認）が明記されている");
  await page.screenshot({ path: path.join(OUT, "10-about.png"), fullPage: true });

  console.log("PWA（manifest・Service Worker・オフライン）");
  const man = await page.evaluate(async () => (await fetch("manifest.webmanifest")).json());
  check(man.start_url === "./" && man.icons.some((i) => i.sizes === "512x512"), "manifest が有効（start_url・512pxアイコン）");
  await page.goto(base); await page.waitForSelector(".exam-card");
  const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  check(swOk, "Service Worker が有効化される");
  await page.reload(); await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".exam-card", { timeout: 5000 }).catch(() => {});
  check((await page.$$(".exam-card")).length === 3, "オフラインでも起動できる");
  await page.goto(base + "#/exam/denko2"); await page.waitForSelector(".mode");
  await page.click('[data-act="random10"]');
  check(!!(await page.waitForSelector(".choice", { timeout: 3000 }).catch(() => null)), "オフラインで出題できる");
  await ctx.setOffline(false);

  console.log("デスクトップ表示");
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await p2.goto(base); await p2.waitForSelector(".exam-card");
  await p2.screenshot({ path: path.join(OUT, "11-desktop.png") });

  check(errors.length === 0, "JSエラー・コンソールエラーなし" + (errors.length ? " → " + errors.join(" | ") : ""));
  await browser.close(); server.close();
  console.log(`\n結果: ${pass} 件成功 / ${failN} 件失敗  （スクリーンショット: ${OUT}）`);
  process.exit(failN ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
