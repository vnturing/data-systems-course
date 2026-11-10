#!/usr/bin/env python3
"""Lint quizzes in lessons/*.html: equal word counts per question, varied answer positions."""
import re, json, glob, sys
bad = 0
for f in sorted(glob.glob('lessons/*.html')):
    m = re.search(r'<script type="application/json" id="quiz-data">(.*?)</script>', open(f).read(), re.S)
    if not m: continue
    data = json.loads(m.group(1)); pos = []
    for i, q in enumerate(data, 1):
        wc = [len(o.split()) for o in q['options']]; cc = [len(o) for o in q['options']]
        pos.append(q['answer'])
        ok = len(set(wc)) == 1
        print(f"{f} Q{i}: words={wc} chars={cc} answer={q['answer']} {'OK' if ok else 'WORD-COUNT MISMATCH'}")
        bad += not ok
    if len(data) > 2 and len(set(pos)) == 1:
        print(f"{f}: all correct answers in same position"); bad += 1
sys.exit(1 if bad else 0)
