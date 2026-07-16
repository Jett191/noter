#!/usr/bin/env python3
"""Verify that each 「摘自 …」 annotation in paper/noterPaper.md
points to a real file and that the line range matches the snippet content.

Strategy:
  1. Find each annotation tuple (path, start, end).
  2. Read the file and the preceding fenced code block from the paper.
  3. Compare the snippet's first/last few non-blank lines against the file
     at the claimed range; if mismatched, scan for a contiguous block in the
     file whose lines match the snippet (allowing a tail of author-inserted
     elision notes), and report the offset.
"""
import os
import re
import sys

REPO = "/Users/jett/code/graduate/noter"
PAPER = os.path.join(REPO, "paper/noterPaper.md")

ANNOT_RE = re.compile(r"摘自\s*`([^`]+)`\s*第\s*(\d+)\s*至\s*(\d+)\s*行")


def normalize(line: str) -> str:
    """Collapse all whitespace runs to a single space and strip ends.
    This allows minor whitespace/indentation differences between the paper's
    code blocks and the source file (e.g. dedenting for typesetting)."""
    return re.sub(r"\s+", " ", line).strip()


def read_paper_lines():
    with open(PAPER, "r", encoding="utf-8") as f:
        return f.readlines()


def read_file_lines(path):
    full = os.path.join(REPO, path)
    if not os.path.isfile(full):
        return None
    with open(full, "r", encoding="utf-8") as f:
        return f.readlines()


def find_preceding_code_block(paper_lines, annot_idx):
    end = None
    for i in range(annot_idx - 1, -1, -1):
        if paper_lines[i].lstrip().startswith("```"):
            end = i
            break
    if end is None:
        return None
    start = None
    for j in range(end - 1, -1, -1):
        if paper_lines[j].lstrip().startswith("```"):
            start = j
            break
    if start is None:
        return None
    return paper_lines[start + 1 : end]


def find_contiguous_range(file_lines, body_lines):
    """Find a contiguous range [s, e] (1-based) in file_lines such that
    file_lines[s-1:e] equals body_lines exactly (after rstrip).
    Returns (s, e, matched_count). matched_count is how many leading body
    lines could be matched contiguously starting from any candidate."""
    if not body_lines:
        return None
    body_norm = [normalize(l) for l in body_lines]
    file_norm = [normalize(l) for l in file_lines]
    # Skip leading blank lines in body for anchor
    anchor_idx = 0
    while anchor_idx < len(body_norm) and not body_norm[anchor_idx].strip():
        anchor_idx += 1
    if anchor_idx >= len(body_norm):
        return None
    anchor = body_norm[anchor_idx]

    best = None  # (start_in_file_1based, matched_count, match_len)
    for fi in range(len(file_norm)):
        if file_norm[fi] != anchor:
            continue
        # Try to align: file index fi corresponds to body index anchor_idx
        # Walk forward from anchor through body, checking against file.
        matched = 0
        bi = 0
        ok = True
        while bi < len(body_norm):
            tgt = file_norm[fi - anchor_idx + bi] if (fi - anchor_idx + bi) >= 0 and (fi - anchor_idx + bi) < len(file_norm) else None
            if tgt is None:
                ok = False
                break
            if body_norm[bi] == tgt:
                matched += 1
                bi += 1
            else:
                break
        s_1based = fi - anchor_idx + 1
        if s_1based < 1:
            continue
        if best is None or matched > best[1]:
            best = (s_1based, matched, len(body_norm))
        if matched == len(body_norm):
            return (s_1based, s_1based + matched - 1, matched)
    if best is None:
        return None
    s, matched, total = best
    return (s, s + matched - 1, matched)


def main():
    paper_lines = read_paper_lines()
    annotations = []
    for idx, line in enumerate(paper_lines):
        m = ANNOT_RE.search(line)
        if m:
            annotations.append(
                {
                    "annot_line": idx + 1,
                    "path": m.group(1),
                    "start": int(m.group(2)),
                    "end": int(m.group(3)),
                }
            )

    print(f"Found {len(annotations)} 摘自 annotations with explicit line ranges.\n")

    rows = []
    for a in annotations:
        path, start, end = a["path"], a["start"], a["end"]
        annot_line = a["annot_line"]

        file_lines = read_file_lines(path)
        if file_lines is None:
            rows.append({**a, "status": "FAIL", "reason": "file not found"})
            continue

        body_lines = find_preceding_code_block(paper_lines, annot_line - 1)
        if body_lines is None:
            rows.append(
                {**a, "status": "FAIL", "reason": "no preceding fenced code block"}
            )
            continue

        if end > len(file_lines):
            rows.append(
                {
                    **a,
                    "status": "FAIL",
                    "reason": f"end-line {end} exceeds file length {len(file_lines)}",
                }
            )
            continue

        actual_lines = file_lines[start - 1 : end]
        snippet_count = len(body_lines)
        range_count = end - start + 1

        # Compare top/bottom of body_lines vs actual_lines
        top_body = [normalize(l) for l in body_lines[:3]]
        top_actual = [normalize(l) for l in actual_lines[:3]]
        first_match = top_body == top_actual

        # For the bottom comparison, also try ignoring trailing blank or
        # author-elision lines (lines starting with `      // 见原文件` etc.)
        def trim_author_tail(lines):
            out = list(lines)
            while out and (
                not out[-1].strip()
                or "见原文件" in out[-1]
                or "省略" in out[-1]
            ):
                out.pop()
            return out

        body_for_tail = trim_author_tail(body_lines)
        bottom_body = [normalize(l) for l in body_for_tail[-3:]]
        bottom_actual = [
            normalize(l) for l in file_lines[start - 1 : start - 1 + len(body_for_tail)][-3:]
        ]
        # If body was trimmed, compare against file at start..start+len(body_for_tail)-1
        last_match = bottom_body == bottom_actual

        offset_hint = ""
        contig = None
        if not (first_match and last_match):
            contig = find_contiguous_range(file_lines, body_for_tail or body_lines)
            if contig:
                cs, ce, matched = contig
                tot = len(body_for_tail or body_lines)
                if matched == tot:
                    offset_hint = (
                        f"actual lines are {cs}–{ce}, paper says {start}–{end}"
                    )
                else:
                    offset_hint = (
                        f"contiguous match starts at line {cs} but only "
                        f"{matched}/{tot} body lines align"
                    )
            else:
                offset_hint = "snippet anchor line not found verbatim in file"

        # Determine final status
        status = "PASS"
        notes = []
        if not first_match or not last_match:
            # Check whether the contiguous match exactly equals the claimed range
            if contig:
                cs, ce, matched = contig
                if matched == len(body_for_tail or body_lines) and (cs, ce) == (start, end):
                    # would have been a pass — shouldn't happen because top/bottom matched
                    status = "PASS"
                else:
                    status = "FAIL"
                    if not first_match:
                        notes.append("first-line mismatch")
                    if not last_match:
                        notes.append("last-line mismatch")
                    if offset_hint:
                        notes.append(offset_hint)
            else:
                status = "FAIL"
                if not first_match:
                    notes.append("first-line mismatch")
                if not last_match:
                    notes.append("last-line mismatch")
                if offset_hint:
                    notes.append(offset_hint)
        notes.append(
            f"snippet={snippet_count} lines, range covers {range_count} lines"
        )
        if status == "PASS" and snippet_count != range_count:
            notes.append("(line counts differ — likely trailing author elision note)")
        rows.append({**a, "status": status, "reason": "; ".join(notes)})

    print("| # | Path | Lines | Status | Notes |")
    print("|---|------|-------|--------|-------|")
    for i, r in enumerate(rows, 1):
        print(
            f"| {i} | `{r['path']}` | {r['start']}–{r['end']} | "
            f"{r['status']} | {r['reason']} |"
        )

    n_pass = sum(1 for r in rows if r["status"] == "PASS")
    n_fail = sum(1 for r in rows if r["status"] == "FAIL")
    print(f"\nSummary: {n_pass} PASS, {n_fail} FAIL out of {len(rows)} annotations.")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
