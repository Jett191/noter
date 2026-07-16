/**
 * `/brief` Skill 的 Prompt 模板与输出契约。
 *
 * 输出五区块（与 design.md `/brief` 设计、requirements 3.4 一致）：
 *   1) docType    — 文档类型（论文 / 教程 / 报告 / 其他）
 *   2) thesis     — 核心主张（一句话）
 *   3) chapterMap — 章节地图（取 outline 前两层）
 *   4) audience   — 适合谁读
 *   5) readingPath — 推荐阅读路径，取值严格受限：sequential / skim / deep_dive
 *
 * 两条 prompt 路径：
 *   • 摘要可用 → `buildBriefPromptFromSummary`：直读 document_summaries 五字段 + outline
 *   • 摘要缺失 → `buildBriefPromptFromMarkdown`：markdown 前 N 字 + outline 让 LLM 现场提取
 *
 * Validates: Requirements 3.2, 3.4, 3.7
 */

import { z } from 'zod'

import type { OutlineNode } from '../tools/outline'
import type { DocumentSummary } from '../tools/summary'

// ---------------------------------------------------------------------------
// 输出 schema —— 五字段 BriefCard payload 的强约束
// ---------------------------------------------------------------------------

/**
 * BriefCard payload Zod schema —— 五字段强校验。
 *
 * 配合 `LLMTool.completeJson` 使用：完成解析后即可作为 `payload` 字段直接通过
 * SSE `structured_message: BriefCard` 推送。
 */
export const briefOutputSchema = z.object({
  /** 文档类型（论文 / 教程 / 报告 / 博客 / 其他），用一句话短语表达。 */
  docType: z.string().min(1),
  /** 核心主张：一句话概括（建议 ≤ 60 字）。 */
  thesis: z.string().min(1),
  /** 章节地图：来自 outline 前两层；level ∈ [1,6]。 */
  chapterMap: z.array(
    z.object({
      level: z.number().int().min(1).max(6),
      title: z.string().min(1)
    })
  ),
  /** 适合谁读：用一句话描述目标读者。 */
  audience: z.string().min(1),
  /** 推荐阅读路径：受限取值，前端按此分支渲染样式。 */
  readingPath: z.enum(['sequential', 'skim', 'deep_dive'])
})

export type BriefOutput = z.infer<typeof briefOutputSchema>

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * `/brief` Skill 的 LLM system prompt（中文优先，与文档主体语言一致）。
 *
 * 设计要点：
 * 1. **强制输出五字段 JSON**，与 `briefOutputSchema` 一一对应；任何缺失字段都
 *    会触发 `LLMTool.completeJson` 的 Zod 校验失败 → 自动重试一次。
 * 2. `readingPath` 只允许 `sequential` / `skim` / `deep_dive`；
 *    schema 已用 `z.enum` 拒绝其他取值，prompt 仍显式告知模型可选值。
 * 3. 不允许 markdown 包裹 / 解释性文字；MimoLLM JSON 模式 + system 提示双保险。
 */
export const BRIEF_SYSTEM_PROMPT = `你是 Noter 文档智能阅读系统的「速览」助手。基于用户提供的结构化数据，输出一份五区块的文档速览。请仅输出符合下方 schema 的 JSON 对象，不要使用 markdown 代码块、不要在 JSON 之外添加任何解释。

输出 schema：
{
  "docType": "文档类型，例如：论文 / 教程 / 报告 / 博客 / 其他",
  "thesis": "用一句话概括的核心主张，建议不超过 60 字",
  "chapterMap": [{ "level": 1-6 的整数, "title": "章节标题" }],
  "audience": "适合谁读，一句话描述目标读者",
  "readingPath": "sequential" | "skim" | "deep_dive"
}

约束：
1. 必须输出全部五个字段，缺失或类型错误都会被拒绝。
2. chapterMap 取自给定的章节大纲（最多前两层）；若大纲缺失，则根据原文片段自行提炼，level 用 1 表示一级、2 表示二级。
3. readingPath 必须严格取以下三者之一：
   - sequential：建议从头顺读
   - skim：建议跳读关键段
   - deep_dive：建议精读深读
4. 输出语言与文档主体语言保持一致（中文文档输出中文）。`

// ---------------------------------------------------------------------------
// Outline 扁平化辅助
// ---------------------------------------------------------------------------

/**
 * 把 OutlineNode 树扁平化为前两层（深度 0 + 深度 1）的 `{ level, title }` 列表。
 *
 * design.md `/brief` 的 chapterMap 取自 outline 前两层；这里按**深度**而非
 * heading level 截断，确保不同层级编号约定下都能拿到合理的章节地图。
 */
function flattenOutlineTopTwoLevels(
  outline: OutlineNode[] | null
): { level: number; title: string }[] {
  if (!outline) return []
  const result: { level: number; title: string }[] = []
  for (const node of outline) {
    if (node.title) {
      result.push({ level: node.level, title: node.title })
    }
    for (const child of node.children) {
      if (child.title) {
        result.push({ level: child.level, title: child.title })
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// User prompt 构造
// ---------------------------------------------------------------------------

/**
 * 摘要可用路径：基于 document_summaries 字段 + outline 构造 user prompt。
 *
 * 字段缺失（如 keyPoints 为空数组）以「（无）」占位喂给 LLM，避免出现空段
 * 让模型误以为输入截断。
 */
export function buildBriefPromptFromSummary(args: {
  summary: DocumentSummary
  outline: OutlineNode[] | null
}): string {
  const { summary, outline } = args
  const chapters = flattenOutlineTopTwoLevels(outline)

  const sections: string[] = [
    '# 文档结构化数据',
    '',
    '## summary（摘要正文）',
    summary.summary && summary.summary.trim().length > 0 ? summary.summary : '（无）',
    '',
    '## key_points（关键要点）',
    summary.keyPoints.length > 0 ? summary.keyPoints.map((p) => `- ${p}`).join('\n') : '（无）',
    '',
    '## keywords（关键词）',
    summary.keywords.length > 0 ? summary.keywords.join('、') : '（无）',
    '',
    '## suitable_scenarios（适用场景）',
    formatSuitableScenarios(summary.suitableScenarios),
    '',
    '## outline 前两层',
    chapters.length > 0 ? chapters.map((c) => `- L${c.level} ${c.title}`).join('\n') : '（无）',
    '',
    '请基于以上信息输出五区块速览 JSON。'
  ]

  return sections.join('\n')
}

/**
 * 降级路径：摘要缺失时使用 markdown 前 N 字 + outline 让 LLM 现场提取。
 *
 * design.md `/brief` 降级要求：调用 `OutlineTool.getMarkdownPrefix(documentId, 3000)`
 * 读 markdown_content 前 3000 字 + `getOutline()`。这里只负责把这两块内容
 * 渲染为 prompt 文本；fetch 本身在 Skill Handler 内完成。
 */
export function buildBriefPromptFromMarkdown(args: {
  markdownPrefix: string | null
  outline: OutlineNode[] | null
}): string {
  const { markdownPrefix, outline } = args
  const chapters = flattenOutlineTopTwoLevels(outline)

  const sections: string[] = [
    '# 文档原文片段（前 3000 字）',
    '',
    markdownPrefix && markdownPrefix.length > 0 ? markdownPrefix : '（无可用 markdown 内容）',
    '',
    '# outline 前两层',
    chapters.length > 0 ? chapters.map((c) => `- L${c.level} ${c.title}`).join('\n') : '（无）',
    '',
    '注意：当前文档摘要尚未生成，请基于以上原文片段与大纲现场提取，输出五区块速览 JSON。'
  ]

  return sections.join('\n')
}

// ---------------------------------------------------------------------------
// 私有：suitable_scenarios 渲染
// ---------------------------------------------------------------------------

/**
 * `document_summaries.suitable_scenarios` 是 jsonb，schema 未约束形状（可能是
 * null / 字符串 / 字符串数组 / 任意对象）。这里做无损渲染：
 *   • null / undefined → '（无）'
 *   • string           → 原样
 *   • 字符串数组       → 列表
 *   • 其他对象         → JSON 序列化（让 LLM 自行解读）
 */
function formatSuitableScenarios(value: unknown): string {
  if (value === null || value === undefined) return '（无）'
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : '（无）'
  }
  if (Array.isArray(value)) {
    const items = value
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((v) => `- ${v}`)
    return items.length > 0 ? items.join('\n') : '（无）'
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '（无）'
  }
}
