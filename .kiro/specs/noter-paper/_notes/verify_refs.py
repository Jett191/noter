"""task 12.3 参考文献双向引用核对.

Extract every `[N]` citation from the body of `paper/noterPaper.md`
(excluding fenced code blocks and inline code spans), and compare with
the entries enumerated under `# 参考文献`. Reports PASS/FAIL together
with a reconciliation table.

Validates Requirements 4.1, 4.2.
"""

from __future__ import annotations

import re
from pathlib import Path


PAPER = Path(__file__).resolve().parents[4] / "paper" / "noterPaper.md"


def strip_code(text: str) -> str:
    """Remove fenced code blocks (```...```) and inline code spans (`...`)."""

    # Fenced blocks: greedy across newlines, allow optional language tag.
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    # Inline code spans (single backticks). Avoid touching what's already gone.
    text = re.sub(r"`[^`\n]*`", "", text)
    return text


def split_body_and_refs(text: str) -> tuple[str, str]:
    """Split paper into (body, references-section) using the `# 参考文献` heading.

    Body excludes the references section and everything after (the Appendix).
    References section is the chunk between `# 参考文献` and the next `# ` heading.
    """

    ref_match = re.search(r"^# 参考文献\s*$", text, flags=re.MULTILINE)
    if not ref_match:
        raise SystemExit("未找到 `# 参考文献` 章节标题")

    body = text[: ref_match.start()]

    refs_start = ref_match.end()
    next_h1 = re.search(r"^# [^#\n]", text[refs_start:], flags=re.MULTILINE)
    refs_end = refs_start + (next_h1.start() if next_h1 else len(text) - refs_start)
    references = text[refs_start:refs_end]
    return body, references


def collect_body_citations(body_text: str) -> list[tuple[int, int]]:
    """Return (number, char_offset) pairs for each `[N]` citation in the body.

    Citations are collected in textual order. The offset is the starting
    position inside the (cleaned) body, which we use to verify monotonic
    first-occurrence numbering.
    """

    cleaned = strip_code(body_text)
    return [
        (int(m.group(1)), m.start())
        for m in re.finditer(r"\[(\d+)\]", cleaned)
    ]


def collect_ref_entries(ref_text: str) -> list[int]:
    """Return the list of numeric ids declared in the references section.

    Each entry begins a line with `[N]`.
    """

    return [
        int(m.group(1))
        for m in re.finditer(r"^\[(\d+)\]", ref_text, flags=re.MULTILINE)
    ]


def first_occurrence_order(citations: list[tuple[int, int]]) -> list[int]:
    """Return the list of citation ids in order of first appearance."""

    seen: set[int] = set()
    order: list[int] = []
    for n, _ in citations:
        if n not in seen:
            seen.add(n)
            order.append(n)
    return order


def main() -> int:
    raw = PAPER.read_text(encoding="utf-8")
    body, references = split_body_and_refs(raw)

    body_citations = collect_body_citations(body)
    body_ids = {n for n, _ in body_citations}
    body_first = first_occurrence_order(body_citations)
    body_counts: dict[int, int] = {}
    for n, _ in body_citations:
        body_counts[n] = body_counts.get(n, 0) + 1

    ref_ids_list = collect_ref_entries(references)
    ref_ids = set(ref_ids_list)

    # Checks
    missing_in_refs = sorted(body_ids - ref_ids)  # cited in body but no entry
    missing_in_body = sorted(ref_ids - body_ids)  # entry exists but never cited
    duplicate_ref_entries = sorted(
        n for n in ref_ids_list if ref_ids_list.count(n) > 1
    )
    duplicate_ref_entries = sorted(set(duplicate_ref_entries))

    expected_first_seq = list(range(1, len(body_first) + 1))
    sequence_ok = body_first == expected_first_seq

    refs_sorted_ok = ref_ids_list == sorted(ref_ids_list) and ref_ids_list == list(
        range(1, len(ref_ids_list) + 1)
    )

    # Report
    print("=" * 72)
    print("task 12.3 参考文献双向引用核对")
    print("=" * 72)
    print(f"paper: {PAPER}")
    print(f"正文 [N] 引用总次数: {len(body_citations)}")
    print(f"正文 [N] 不重复编号: {len(body_ids)}")
    print(f"文末参考文献条目数: {len(ref_ids_list)}")
    print()

    print("正文 [N] 首次出现顺序：")
    print("  " + " ".join(f"[{n}]" for n in body_first))
    print()

    print("文末参考文献编号顺序：")
    print("  " + " ".join(f"[{n}]" for n in ref_ids_list))
    print()

    print("各编号在正文中的出现次数（按编号升序）：")
    for n in sorted(body_counts):
        print(f"  [{n}] -> {body_counts[n]} 次")
    print()

    print("逐条对账表：")
    print(f"  {'编号':<6}{'文末有条目':<14}{'正文出现次数':<16}{'首次出现顺序':<18}状态")
    union = sorted(body_ids | ref_ids)
    pos_of: dict[int, int] = {}
    for idx, n in enumerate(body_first, start=1):
        pos_of[n] = idx
    all_ok = True
    for n in union:
        in_ref = "yes" if n in ref_ids else "no"
        cnt = body_counts.get(n, 0)
        order_pos = pos_of.get(n, "—")
        if n in ref_ids and cnt >= 1:
            status = "OK"
        else:
            status = "MISMATCH"
            all_ok = False
        print(
            f"  [{n:<3}] {in_ref:<13}{cnt:<16}{str(order_pos):<18}{status}"
        )
    print()

    print("校验项：")
    print(
        f"  - 正文 [N] ⊆ 文末条目（无悬挂引用）: "
        f"{'PASS' if not missing_in_refs else 'FAIL ' + str(missing_in_refs)}"
    )
    print(
        f"  - 文末条目 ⊆ 正文 [N]（无悬挂条目）: "
        f"{'PASS' if not missing_in_body else 'FAIL ' + str(missing_in_body)}"
    )
    print(
        f"  - 文末编号无重复: "
        f"{'PASS' if not duplicate_ref_entries else 'FAIL ' + str(duplicate_ref_entries)}"
    )
    print(
        f"  - 文末编号 1..N 连续递增: "
        f"{'PASS' if refs_sorted_ok else 'FAIL ' + str(ref_ids_list)}"
    )
    print(
        f"  - 正文按首次出现顺序连续递增 1..N: "
        f"{'PASS' if sequence_ok else 'FAIL 实际顺序为 ' + str(body_first)}"
    )
    print()

    overall = (
        all_ok
        and not missing_in_refs
        and not missing_in_body
        and not duplicate_ref_entries
        and refs_sorted_ok
        and sequence_ok
    )
    print("=" * 72)
    print(f"总体结果: {'PASS' if overall else 'FAIL'}")
    print("=" * 72)
    return 0 if overall else 1


if __name__ == "__main__":
    raise SystemExit(main())
