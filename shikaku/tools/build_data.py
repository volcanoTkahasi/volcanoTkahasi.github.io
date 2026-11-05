#!/usr/bin/env python3
"""問題ソース（tools/src_*.py）から data/*.json と data/bundle.js を生成し、内容を検証する。
使い方:  python3 tools/build_data.py
ソース形式: (分野ID, 問題文, 正解, [誤答x3], 解説)   ※正解は先頭に書く。選択肢はビルド時に決定的シャッフル。
"""
import importlib, json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
sys.path.insert(0, HERE)

VERSION = "1.0.0"
SOURCES = ["src_denko2", "src_otsu4", "src_tsushin2"]
MIN_PER_EXAM = 60


def build(modname):
    m = importlib.import_module(modname)
    meta = dict(m.META)
    cat_ids = {c["id"] for c in meta["categories"]}
    rng = random.Random(meta["id"] + VERSION)  # 決定的シャッフル
    qs, seen = [], set()
    for i, row in enumerate(m.Q, 1):
        assert len(row) == 5, f"{modname} #{i}: 要素数が5ではない"
        cat, text, correct, wrongs, exp = row
        assert cat in cat_ids, f"{modname} #{i}: 未知の分野 {cat}"
        assert len(wrongs) == 3, f"{modname} #{i}: 誤答は3つ必要"
        choices = [correct] + list(wrongs)
        assert all(isinstance(c, str) and c.strip() for c in choices), f"{modname} #{i}: 空の選択肢"
        assert len(set(choices)) == 4, f"{modname} #{i}: 選択肢が重複: {choices}"
        assert text.strip() and exp.strip(), f"{modname} #{i}: 問題文/解説が空"
        assert text not in seen, f"{modname} #{i}: 問題文が重複"
        seen.add(text)
        order = list(range(4)); rng.shuffle(order)
        shuffled = [choices[j] for j in order]
        qs.append({"id": f"{meta['id']}-{i:03d}", "cat": cat, "q": text,
                   "choices": shuffled, "answer": shuffled.index(correct), "exp": exp})
    assert len(qs) >= MIN_PER_EXAM, f"{modname}: {len(qs)}問しかない"
    dist = meta["exam"].get("distribution")
    if dist:
        assert sum(dist.values()) == meta["exam"]["questions"], f"{modname}: 配分合計が出題数と不一致"
        for c, n in dist.items():
            have = sum(1 for q in qs if q["cat"] == c)
            assert have >= n, f"{modname}: 分野{c}は模擬試験に{n}問必要だが{have}問"
    meta["version"] = VERSION
    meta["questions"] = qs
    return meta


def main():
    os.makedirs(DATA, exist_ok=True)
    index = {"version": VERSION, "exams": []}
    bundle = {}
    for s in SOURCES:
        exam = build(s)
        with open(os.path.join(DATA, f"{exam['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(exam, f, ensure_ascii=False, indent=1)
        index["exams"].append({"id": exam["id"], "name": exam["name"], "short": exam["short"],
                               "description": exam["description"], "file": f"data/{exam['id']}.json",
                               "count": len(exam["questions"])})
        bundle[exam["id"]] = exam
        counts = {}
        for q in exam["questions"]:
            counts[q["cat"]] = counts.get(q["cat"], 0) + 1
        pos = [0, 0, 0, 0]
        for q in exam["questions"]:
            pos[q["answer"]] += 1
        print(f"{exam['id']}: {len(exam['questions'])}問 分野別{counts} 正解位置{pos}")
    with open(os.path.join(DATA, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "bundle.js"), "w", encoding="utf-8") as f:
        f.write("/* 自動生成ファイル: python3 tools/build_data.py で再生成 */\n")
        f.write("window.SHIKAKU_DATA=")
        json.dump({"index": index, "exams": bundle}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


if __name__ == "__main__":
    main()
