#!/usr/bin/env python3
"""サイトの絶対URLを一括置換する（独自ドメイン移行用）。
使い方： python3 scripts/set_base_url.py https://example.com
現在の基準URLは scripts/BASE_URL に保存。canonical・og:url・JSON-LD・sitemap・robots を対象にする。"""
import sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
cfg = root / 'scripts' / 'BASE_URL'
old = cfg.read_text().strip().rstrip('/')
new = sys.argv[1].strip().rstrip('/')
n = 0
for f in root.rglob('*'):
    if '.git' in f.parts or not f.is_file() or f.suffix not in {'.html', '.xml', '.txt', '.json', '.webmanifest', '.js'}:
        continue
    s = f.read_text(encoding='utf-8', errors='ignore')
    if old in s:
        f.write_text(s.replace(old, new), encoding='utf-8'); n += 1
cfg.write_text(new + '\n')
print(f'{n} files: {old} -> {new}')
