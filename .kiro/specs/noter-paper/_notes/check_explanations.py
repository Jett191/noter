#!/usr/bin/env python3
"""Check 简短解释 word count: CJK char = 1, English/code token = 1, punctuation = 0."""
import re
from pathlib import Path

CHART = Path("/Users/jett/code/graduate/noter/paper/noterChart.md")

text = CHART.read_text()
parts = re.split(r"^## 图 ", text, flags=re.MULTILINE)
entries = parts[1:]


def cn_word_count(s: str) -> int:
    # Replace English tokens (alnum sequences possibly with /._-) by a single placeholder, then count CJK + placeholder
    # Strip backticks
    s = s.replace("`", "")
    # English/code tokens: sequences of [A-Za-z0-9_/.\-]
    s2, n_eng = re.subn(r"[A-Za-z0-9_/.\-]+", "X", s)
    # Now count CJK chars + the X tokens
    n_cjk = 0
    n_x = 0
    for ch in s2:
        if "\u4e00" <= ch <= "\u9fff":
            n_cjk += 1
        elif ch == "X":
            n_x += 1
    return n_cjk + n_x


errors = []
for entry in entries:
    head_line, _, rest = entry.partition("\n")
    fig_id = head_line.split()[0]
    m = re.search(r"-\s*简短解释[：:]\s*(.+)$", rest, flags=re.MULTILINE)
    if not m:
        errors.append(f"图 {fig_id}: 缺 简短解释")
        continue
    explanation = m.group(1).strip()
    n = cn_word_count(explanation)
    in_range = 30 <= n <= 80
    print(f"图 {fig_id}: {n} 字 [{'OK' if in_range else 'OUT'}]   {explanation[:60]}{'…' if len(explanation)>60 else ''}")
    if not in_range:
        errors.append(f"图 {fig_id}: {n} 字 (range 30—80)")

print()
if errors:
    for e in errors:
        print("WARN:", e)
else:
    print("All entries within 30—80 字 budget.")
