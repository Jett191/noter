/**
 * `/actions` Prompt 模板。
 *
 * 单一入口：`buildActionsPrompt(input)` —— 把 SummaryTool 读出的结构化字段
 * （summary / key_points / keywords / suitable_scenarios / todos）以及 OutlineTool
 * 取到的 outline + 各章首段一并喂给 LLM，要求其输出严格 JSON：
 *
 *   {
 *     "todos": string[],            // ≤ 20
 *     "conceptsToLearn": string[],  // ≤ 8
 *     "readingSuggestions": string[]// ≤ 5
 *   }
 *
 * 设计要点：
 *
 *   1. **不强依赖 summary.todos** —— prompt 显式告知「summary.todos 缺失时仍要从其他
 *      字段提取」，与 requirements 6.2 / 6.8 的「同等对待」一致。
 *   2. **不要求 LLM 标注引用 / 不写回文档** —— ActionsCard 是纯展示；prompt 里
 *      明确不要 chunk id / heading 引用之类的来源标注。
 *   3. **数量约束** —— 即便 prompt 已要求 ≤ 20/8/5，Skill 侧仍会调用 Zod schema
 *      校验并对超出的数组 `slice` 截断（双保险）。
 *   4. **降级路径** —— `summary` 字段为 null 时，`buildActionsPrompt` 会自动切换
 *      文案，要求 LLM 仅基于 outline + 各章首段现场提取，不再假装 summary 存在。
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.8
 */

import type { LLMMessage } from '../tools/llm'

// ---------------------------------------------------------------------------
// 常量上限（与 Skill 侧 Zod schema / slice 截断保持一致）
// ---------------------------------------------------------------------------

const MAX_TODOS = 20
const MAX_CONCEPTS = 8
const MAX_READINGS = 5

// ---------------------------------------------------------------------------
// 输入：buildActionsPrompt
// ---------------------------------------------------------------------------

/** 单章首段：headingPath（章节路径）+ snippet（章首 chunk 内容截断） */
export interface ChapterHeadSnippet {
  headingPath: string[]
  snippet: string
}

export interface ActionsPromptInput {
  /** SummaryTool.getSummary 返回的字段；缺失（整条记录不存在）时为 null */
  summary: {
    summary: string | null
    keyPoints: string[]
    keywords: string[]
    /** jsonb 透传，可能是 null / 对象 / 数组 / 字符串；prompt 中按 JSON.stringify 渲染 */
    suitableScenarios: unknown
    todos: string[]
  } | null
  /** outline 顶层章节标题列表（供 LLM 把握全文骨架；缺失时为空数组） */
  outlineTitles: string[]
  /** 各章首段（chunk_index 最小的 chunk）；最多 N 条由 Skill 侧裁剪 */
  chapterHeads: ChapterHeadSnippet[]
}

// ---------------------------------------------------------------------------
// 系统提示
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  '你是 Noter 阅读行动项提取助手。基于用户提供的「文档结构化信息」生成三组数组：',
  '',
  '1) todos —— 「读完这篇我应该做的下一步」清单',
  '2) conceptsToLearn —— 「为了更好地理解 / 应用这篇文档，我还需要继续学习的关联概念」',
  '3) readingSuggestions —— 「与本文主题相关、值得延伸阅读的方向 / 主题 / 关键词」',
  '',
  '严格要求：',
  `1. 仅输出一个 JSON 对象：{"todos": [...], "conceptsToLearn": [...], "readingSuggestions": [...]}；不要 markdown 代码块包裹、不要解释性前后缀。`,
  `2. todos 数组长度 ≤ ${MAX_TODOS}；conceptsToLearn ≤ ${MAX_CONCEPTS}；readingSuggestions ≤ ${MAX_READINGS}。`,
  '3. 数组每个元素是一条简短的中文短句（10-40 个汉字），不要嵌套对象、不要 markdown 标记、不要编号前缀。',
  '4. 优先复用 summary.todos / summary.keyPoints / summary.keywords 中已有的内容；不足时再基于 outline + 各章首段提炼，但**不要凭空编造文档之外的事实**。',
  '5. 若 summary 字段为 null（不存在），则仅依据 outlineTitles + chapterHeads 现场提取，仍要给出三组数组；不要因数据不全而拒答或返回空数组。',
  '6. 不要在条目中标注「chunk」「[1]」「来源：xx」等引用；这是纯展示卡片，引用由其他 Skill 处理。'
].join('\n')

// ---------------------------------------------------------------------------
// 渲染辅助
// ---------------------------------------------------------------------------

function renderStringArray(arr: readonly string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '(无)'
  return arr.map((s, i) => `${i + 1}. ${s}`).join('\n')
}

function renderSuitableScenarios(value: unknown): string {
  if (value === null || value === undefined) return '(无)'
  if (typeof value === 'string') return value.trim() || '(无)'
  try {
    return JSON.stringify(value)
  } catch {
    return '(无法序列化)'
  }
}

function renderChapterHeads(heads: readonly ChapterHeadSnippet[]): string {
  if (heads.length === 0) return '(无)'
  return heads
    .map((h, i) => {
      const heading = h.headingPath.length > 0 ? h.headingPath.join(' / ') : '(无章节)'
      return `[${i + 1}] 章节：${heading}\n首段：${h.snippet}`
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// buildActionsPrompt
// ---------------------------------------------------------------------------

export function buildActionsPrompt(input: ActionsPromptInput): LLMMessage[] {
  const { summary, outlineTitles, chapterHeads } = input

  // summary 缺失态：明示 LLM 不要假装 summary 存在
  const summaryBlock = summary
    ? [
        '[SUMMARY]',
        summary.summary?.trim() ? summary.summary.trim() : '(无)',
        '',
        '[KEY_POINTS]',
        renderStringArray(summary.keyPoints),
        '',
        '[KEYWORDS]',
        renderStringArray(summary.keywords),
        '',
        '[SUITABLE_SCENARIOS]',
        renderSuitableScenarios(summary.suitableScenarios),
        '',
        '[TODOS_FROM_SUMMARY]',
        renderStringArray(summary.todos)
      ].join('\n')
    : [
        '[SUMMARY_AVAILABLE]',
        'false（document_summaries 缺失，请仅基于 outline + 各章首段现场提取）'
      ].join('\n')

  const userBlock = [
    summaryBlock,
    '',
    '[OUTLINE_TITLES]',
    renderStringArray(outlineTitles),
    '',
    '[CHAPTER_HEADS]',
    renderChapterHeads(chapterHeads)
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userBlock }
  ]
}

/**
 * 历史占位导出（保持向后兼容；不再被引用，可在后续清理中移除）。
 */
export const actionsPrompt = ''
