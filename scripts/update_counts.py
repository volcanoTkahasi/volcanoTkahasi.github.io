#!/usr/bin/env python3
"""資格ドリルの問題数を問題データから数え、HTML/manifest/JSの「オリジナル4択問題NNN問」「オリジナル問題NNN問」を一括更新する。
問題データを増減したら必ず実行： python3 scripts/update_counts.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = root / 'shikaku' / 'data'
idx = json.loads((d / 'index.json').read_text(encoding='utf-8'))
exams = idx.get('exams', [])
total = 0
for e in exams:
    q = json.loads((d / f"{e['id']}.json").read_text(encoding='utf-8'))
    total += len(q['questions'] if isinstance(q, dict) else q)
pat = re.compile(r'(オリジナル(?:4択)?問題)\d+(問)')
for f in [root/'shikaku/index.html', root/'shikaku/manifest.webmanifest', root/'shikaku/js/app.js', root/'index.html']:
    if f.exists():
        s = f.read_text(encoding='utf-8'); n = pat.sub(rf'\g<1>{total}\g<2>', s)
        if n != s: f.write_text(n, encoding='utf-8'); print('updated', f.relative_to(root))
print('total questions =', total)
