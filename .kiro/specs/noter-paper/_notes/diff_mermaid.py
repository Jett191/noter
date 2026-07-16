#!/usr/bin/env python3
"""Extract mermaid blocks from noterPaper.md and noterChart.md, compare them by figure number."""
import re
import sys
from pathlib import Path

PAPER = Path("/Users/jett/code/graduate/noter/paper/noterPaper.md")
CHART = Path("/Users/jett/code/graduate/noter/paper/noterChart.md")


def extract_blocks_paper(text: str):
    blocks = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].strip() == "```mermaid":
            start = i + 1
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            body = "\n".join(lines[start:j])
            # Find caption line: skip blanks then expect 图 X.Y <name>
            k = j + 1
            caption = None
            while k < len(lines) and k < j + 5:
                ln = lines[k].strip()
                m = re.match(r"^图\s+(\d+\.\d+)\s+(.+)$", ln)
                if m:
                    caption = (m.group(1), m.group(2))
                    break
                k += 1
            key = caption[0] if caption else f"unknown@{i}"
            blocks[key] = {"body": body, "caption": caption, "fence_start": i + 1, "fence_end": j + 1}
            i = j + 1
        else:
            i += 1
    return blocks


def extract_blocks_chart(text: str):
    blocks = {}
    lines = text.split("\n")
    current_caption = None
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        m = re.match(r"^##\s+图\s+(\d+\.\d+)\s+(.+)$", ln)
        if m:
            current_caption = (m.group(1), m.group(2))
        if ln == "```mermaid":
            start = i + 1
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            body = "\n".join(lines[start:j])
            key = current_caption[0] if current_caption else f"unknown@{i}"
            blocks[key] = {"body": body, "caption": current_caption, "fence_start": i + 1, "fence_end": j + 1}
            i = j + 1
        else:
            i += 1
    return blocks


def main():
    paper_text = PAPER.read_text()
    chart_text = CHART.read_text()

    paper_blocks = extract_blocks_paper(paper_text)
    chart_blocks = extract_blocks_chart(chart_text)

    print(f"Paper has {len(paper_blocks)} mermaid blocks: {sorted(paper_blocks.keys())}")
    for k in sorted(paper_blocks):
        b = paper_blocks[k]
        print(f"  paper 图 {k}: caption={b['caption']}  fence={b['fence_start']}-{b['fence_end']}")
    print(f"\nChart has {len(chart_blocks)} mermaid blocks: {sorted(chart_blocks.keys())}")
    for k in sorted(chart_blocks):
        b = chart_blocks[k]
        print(f"  chart 图 {k}: caption={b['caption']}  fence={b['fence_start']}-{b['fence_end']}")

    only_paper = sorted(set(paper_blocks) - set(chart_blocks))
    only_chart = sorted(set(chart_blocks) - set(paper_blocks))
    both = sorted(set(paper_blocks) & set(chart_blocks))
    print(f"\nOnly in paper: {only_paper}")
    print(f"Only in chart: {only_chart}")
    print(f"In both: {both}")

    print("\n=== Body diffs ===")
    all_match = True
    for k in both:
        p = paper_blocks[k]["body"]
        c = chart_blocks[k]["body"]
        if p == c:
            print(f"  图 {k}: MATCH ({len(p.splitlines())} lines)")
        else:
            all_match = False
            print(f"  图 {k}: DIFFERS")
            import difflib
            for line in difflib.unified_diff(
                p.splitlines(), c.splitlines(),
                fromfile=f"paper:{k}", tofile=f"chart:{k}",
                lineterm="", n=2
            ):
                print("    " + line)

    print("\nAll match:", all_match)
    return 0 if all_match and not only_paper and not only_chart else 1


if __name__ == "__main__":
    sys.exit(main())
