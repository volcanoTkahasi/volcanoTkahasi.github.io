#!/usr/bin/env node
/* 問題データの検証: node tools/validate.js
   - すべての問題に4つの選択肢・正解1つ・解説があるか
   - ID・問題文の重複、分野ID、模擬試験に必要な問題数
   - bundle.js と各 JSON が一致しているか */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
let errors = 0;
const fail = (m) => { errors++; console.error("NG: " + m); };

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data/index.json"), "utf8"));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "data/bundle.js"), "utf8"), sandbox);
const bundle = sandbox.window.SHIKAKU_DATA;
if (!bundle) fail("bundle.js に SHIKAKU_DATA がない");

const ids = new Set();
let total = 0;
for (const meta of index.exams) {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, meta.file), "utf8"));
  const cats = new Set(ex.categories.map((c) => c.id));
  const texts = new Set();
  if (meta.count !== ex.questions.length) fail(`${ex.id}: index.json の count 不一致`);
  if (JSON.stringify(bundle.exams[ex.id]) !== JSON.stringify(ex)) fail(`${ex.id}: bundle.js と JSON が不一致`);
  for (const q of ex.questions) {
    const where = `${ex.id}/${q.id}`;
    if (ids.has(q.id)) fail(`${where}: ID重複`); ids.add(q.id);
    if (!cats.has(q.cat)) fail(`${where}: 未知の分野 ${q.cat}`);
    if (typeof q.q !== "string" || q.q.trim().length < 5) fail(`${where}: 問題文が不正`);
    if (texts.has(q.q)) fail(`${where}: 問題文重複`); texts.add(q.q);
    if (!Array.isArray(q.choices) || q.choices.length !== 4) fail(`${where}: 選択肢が4つではない`);
    else {
      if (q.choices.some((c) => typeof c !== "string" || !c.trim())) fail(`${where}: 空の選択肢`);
      if (new Set(q.choices).size !== 4) fail(`${where}: 選択肢が重複`);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) fail(`${where}: 正解インデックスが不正`);
    if (typeof q.exp !== "string" || q.exp.trim().length < 10) fail(`${where}: 解説がない/短すぎる`);
    const sentences = (q.exp.match(/[。！？]/g) || []).length;
    if (sentences > 4) fail(`${where}: 解説が長すぎる（${sentences}文）`);
  }
  const e = ex.exam;
  if (!e || !e.questions || !e.minutes || !e.pass) fail(`${ex.id}: 試験設定がない`);
  if (e.distribution) {
    let sum = 0;
    for (const [c, n] of Object.entries(e.distribution)) {
      sum += n;
      const have = ex.questions.filter((q) => q.cat === c).length;
      if (have < n) fail(`${ex.id}: 分野 ${c} の問題が模試に足りない (${have}/${n})`);
    }
    if (sum !== e.questions) fail(`${ex.id}: 配分の合計 ${sum} ≠ ${e.questions}`);
  } else if (ex.questions.length < e.questions) fail(`${ex.id}: 模試に必要な問題数が足りない`);
  if (ex.questions.length < 60) fail(`${ex.id}: 60問未満 (${ex.questions.length})`);
  const per = {};
  ex.questions.forEach((q) => (per[q.cat] = (per[q.cat] || 0) + 1));
  console.log(`OK  ${ex.id} ${ex.name}: ${ex.questions.length}問`, per);
  total += ex.questions.length;
}
console.log(`合計 ${total}問`);
if (errors) { console.error(`\n${errors} 件のエラー`); process.exit(1); }
console.log("データ検証: すべてOK");
