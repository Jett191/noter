#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_word_count.py — 验证 paper/noterPaper.md 第一章至第七章 + 总结与展望
正文中文字符数是否落在 15000—30000 区间，以及每章是否在各自预算内。

规则：
1. 范围：从 `# 第一章` 到 `## 2. 展望` 末尾（含），排除 `# 参考文献` 与 `# 附录`。
2. 去除 fenced code blocks (```...```)，含 mermaid。
3. 去除 Markdown 表格行（以 `|` 开头或包含 ≥3 个 `|`）。
4. 仅统计 Unicode 范围 \u4e00-\u9fff 的中文字符。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple

PAPER_PATH = Path(__file__).resolve().parent / "noterPaper.md"

# 章节预算 (lo, hi)
CHAPTER_BUDGETS = {
    "第一章 绪论":              (2500, 4500),
    "第二章 开发环境与主要技术介绍": (1500, 2500),
    "第三章 需求分析":           (2500, 4500),
    "第四章 概要设计":           (2500, 4500),
    "第五章 详细设计":           (2500, 4500),
    "第六章 系统实现与代码编写":   (1500, 3000),
    "第七章 软件测试":           (1200, 2000),
    "总结与展望":               (800,  1500),
}

# 总区间
TOTAL_LO, TOTAL_HI = 15000, 30000

CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def split_chapters(lines: List[str]) -> List[Tuple[str, List[str]]]:
    """按 `# 第N章` / `# 总结与展望` 切分；遇到 `# 参考文献` 或 `# 附录` 立即停止。"""
    chapters: List[Tuple[str, List[str]]] = []
    current_title: str | None = None
    current_buf: List[str] = []

    for line in lines:
        stripped = line.rstrip("\n")
        # 仅看一级标题
        m_h1 = re.match(r"^#\s+(.+?)\s*$", stripped)
        if m_h1:
            title = m_h1.group(1).strip()
            # 终止标题
            if title.startswith("参考文献") or title.startswith("附录"):
                if current_title is not None:
                    chapters.append((current_title, current_buf))
                    current_title = None
                    current_buf = []
                break
            # 章节起点：第X章 / 总结与展望
            if re.match(r"^第[一二三四五六七八九十]+章", title) or title.startswith("总结与展望"):
                # 提交上一个
                if current_title is not None:
                    chapters.append((current_title, current_buf))
                current_title = title
                current_buf = []
                continue
            # 其它一级标题 → 暂归入当前缓冲
        if current_title is not None:
            current_buf.append(stripped)

    if current_title is not None:
        chapters.append((current_title, current_buf))

    return chapters


def strip_code_blocks(buf: List[str]) -> List[str]:
    """去除 ``` 围栏代码块（含 mermaid）。"""
    out: List[str] = []
    in_fence = False
    for ln in buf:
        if ln.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        out.append(ln)
    return out


def strip_table_rows(buf: List[str]) -> List[str]:
    """去除 Markdown 表格行：以 `|` 开头 或 包含 ≥3 个 `|`。"""
    out: List[str] = []
    for ln in buf:
        s = ln.strip()
        if s.startswith("|") or s.count("|") >= 3:
            continue
        out.append(ln)
    return out


def count_cjk(buf: List[str]) -> int:
    text = "\n".join(buf)
    return len(CJK_RE.findall(text))


def main() -> int:
    if not PAPER_PATH.exists():
        print(f"[ERROR] 论文文件不存在: {PAPER_PATH}", file=sys.stderr)
        return 2

    lines = PAPER_PATH.read_text(encoding="utf-8").splitlines()
    chapters = split_chapters(lines)

    print(f"论文文件: {PAPER_PATH}")
    print(f"识别到章节数: {len(chapters)}")
    print()

    total = 0
    rows = []
    over_budget: List[str] = []
    under_budget: List[str] = []

    for title, buf in chapters:
        cleaned = strip_table_rows(strip_code_blocks(buf))
        cnt = count_cjk(cleaned)
        total += cnt

        # 找到该章节的预算
        budget = None
        for key, val in CHAPTER_BUDGETS.items():
            if title.startswith(key):
                budget = val
                break
        rows.append((title, cnt, budget))

        if budget is not None:
            lo, hi = budget
            if cnt > hi:
                over_budget.append(f"  - {title}: {cnt} 字（预算 {lo}—{hi}，超出 {cnt-hi}）")
            elif cnt < lo:
                under_budget.append(f"  - {title}: {cnt} 字（预算 {lo}—{hi}，不足 {lo-cnt}）")

    # 输出明细
    print("=" * 72)
    print(f"{'章节':<32} {'中文字符':>10} {'预算':>14} {'状态':>8}")
    print("-" * 72)
    for title, cnt, budget in rows:
        if budget is None:
            status = "—"
            budget_str = "—"
        else:
            lo, hi = budget
            budget_str = f"{lo}—{hi}"
            if cnt < lo:
                status = "↓不足"
            elif cnt > hi:
                status = "↑超出"
            else:
                status = "✓"
        # 中文宽度对齐：粗略按 visual width 截断
        disp_title = title if len(title) <= 30 else title[:29] + "…"
        print(f"{disp_title:<32} {cnt:>10} {budget_str:>14} {status:>8}")
    print("-" * 72)
    print(f"{'合计':<32} {total:>10} {f'{TOTAL_LO}—{TOTAL_HI}':>14}")
    print("=" * 72)
    print()

    # 总判定
    in_range = TOTAL_LO <= total <= TOTAL_HI
    print(f"总字数判定: {'PASS ✓' if in_range else 'FAIL ✗'}")
    if not in_range:
        if total < TOTAL_LO:
            print(f"  当前 {total} 字，距离下限 {TOTAL_LO} 还差 {TOTAL_LO - total} 字")
        else:
            print(f"  当前 {total} 字，超过上限 {TOTAL_HI} 共 {total - TOTAL_HI} 字")

    # 章节预算情况（仅作参考，不影响总判定）
    if over_budget or under_budget:
        print()
        print("章节预算偏离（仅供参考，建议 task 12.4 报告中体现）:")
        if over_budget:
            print(" 超出预算的章节：")
            for s in over_budget:
                print(s)
        if under_budget:
            print(" 不足预算的章节：")
            for s in under_budget:
                print(s)
    else:
        print()
        print("所有章节均在各自预算区间内 ✓")

    return 0 if in_range else 1


if __name__ == "__main__":
    sys.exit(main())
