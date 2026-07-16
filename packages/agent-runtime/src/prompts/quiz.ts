/**
 * `/quiz` Prompt 构造 —— 出题阶段（answering）的 LLMTool.completeJson 入参。
 *
 * 设计目标：
 *   1. 给出**结构化**的素材（outline + summary key_points + 章节首段采样），
 *      让 LLM 不必自由发挥就能定位题源；
 *   2. 在 system prompt 里**逐项约束** JSON 输出：`type`、`stem`、`options?`、
 *      `correctAnswer` 的字段联合规则与「options 当且仅当 type ∈ {single, multi}
 *      时存在」的硬约束；
 *   3. 强制 `questions.length === count`（不允许隐式截断或补全），并给出难度
 *      分配指引（recall / understand / apply / mixed）。
 *
 * 注意：实际 schema 校验在 LLMTool.completeJson 里用 zod discriminatedUnion
 * 强制；这里的 system 文本仅是「软提示」让 LLM 一次到位、降低重试概率。
 *
 * 与 quiz.ts 的字段映射：
 *   - LLM 端：`stem`（与 task hint 对齐）
 *   - Skill Handler：归一化为 `question`（与 design.md `QuizQuestion.question` 对齐）
 *
 * Validates: Requirements 7.5, 7.6, 7.7, 15.3
 */

import type { LLMMessage } from '../tools/llm'
import type { OutlineNode } from '../tools/outline'
import type { DocumentSummary } from '../tools/summary'
import type { QuizConfig, QuizConfigDifficulty, QuizQuestionType } from '../skills/quiz'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface QuizPromptInput {
  config: QuizConfig
  outline: OutlineNode[] | null
  summary: DocumentSummary | null
  chapterSamples: { title: string; content: string }[]
}

/**
 * 构造给 LLMTool.completeJson 的 messages。返回 `LLMMessage[]` 而非单字符串：
 * 系统约束放在 `system` role，素材放在 `user` role —— 便于 LLMTool.completeJson
 * 的 JSON-mode system hint 与本 system 拼接时不丢失结构。
 */
export function buildQuizGenerationPrompt(input: QuizPromptInput): LLMMessage[] {
  const system = buildSystemPrompt(input.config)
  const user = buildUserPrompt(input)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

/**
 * 兼容占位文件原导出 `quizPrompt`；不再使用，保留导出避免下游误删后断链。
 * 真正的 prompt 构造请用 `buildQuizGenerationPrompt`。
 */
export const quizPrompt = ''

// ---------------------------------------------------------------------------
// system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(config: QuizConfig): string {
  const typeList = config.questionTypes.join(', ')
  const difficultyHint = describeDifficulty(config.difficulty)
  const lines = [
    '你是一名命题专家，正在为单文档阅读理解出题。',
    '请仅依据「用户消息」中提供的文档结构化素材出题，不要引入文档外的事实。',
    '',
    `要求：题目数量必须严格等于 ${config.count}，不允许多出或少于这个数量。`,
    `题型必须从以下集合中选取（同一组题中可以混用）：${typeList}。`,
    `难度策略：${difficultyHint}`,
    '',
    '输出**仅** JSON，结构如下：',
    '{',
    '  "questions": [',
    '    {',
    '      "type": "single" | "multi" | "fill" | "short",',
    '      "stem": "题干，使用陈述疑问句",',
    '      "options": ["A 选项", "B 选项", ...],         // 仅当 type ∈ {single, multi} 时**必须**给出，长度 ≥ 2；其他题型**不要**包含此字段',
    '      "correctAnswer": <answer>,                    // single → 选项原文字符串；multi → 选项原文字符串数组（长度 ≥ 1）；fill / short → 简洁字符串',
    '      "difficulty": "recall" | "understand" | "apply"   // 可选；不给将由后端兜底',
    '    }',
    '  ]',
    '}',
    '',
    '硬约束：',
    '1. `options` 字段当且仅当 `type ∈ {single, multi}` 时出现；fill / short 题**绝对不要**包含 `options`。',
    '2. `correctAnswer` 的类型必须与 `type` 匹配（single → string；multi → string[]；fill / short → string）。',
    '3. multi 题的 `correctAnswer` 必须是 `options` 中某些选项的**原文字符串**子集，至少一个。',
    '4. single 题的 `correctAnswer` 必须等于 `options` 中某一个选项的**原文字符串**。',
    '5. fill / short 题的答案应是简洁、可比对的文本（控制在 1-30 字之间，避免长段落）。',
    '6. 题干 `stem` 必须自包含可独立阅读，不要使用「如上文所述」「参见上一题」等指代。',
    '7. 不同题之间避免内容高度重复；尽量覆盖不同章节。',
    '',
    '不要包含任何 markdown 代码块标记、解释性文字或 JSON 之外的内容。'
  ]
  return lines.join('\n')
}

function describeDifficulty(difficulty: QuizConfigDifficulty | undefined): string {
  switch (difficulty) {
    case 'recall':
      return '全部为 recall 难度，关注关键术语 / 定义 / 直接事实。'
    case 'understand':
      return '全部为 understand 难度，关注概念关系 / 因果 / 对比。'
    case 'apply':
      return '全部为 apply 难度，关注情境迁移 / 案例分析。'
    case 'mixed':
    case undefined:
      return 'mixed —— 在 recall / understand / apply 三种难度之间均衡分布，并在每题的 difficulty 字段标注。'
  }
}

// ---------------------------------------------------------------------------
// user prompt：素材打包
// ---------------------------------------------------------------------------

function buildUserPrompt(input: QuizPromptInput): string {
  const sections: string[] = []
  sections.push('# 文档结构化素材')

  // —— Outline（顶层 + 二级章节标题，控制在 ~30 行）——
  const outlineText = formatOutline(input.outline)
  sections.push('## 章节大纲')
  sections.push(outlineText.length > 0 ? outlineText : '（大纲未就绪，凭关键要点与章节首段出题。）')

  // —— Summary key_points + keywords ——
  if (input.summary) {
    const kp = input.summary.keyPoints.filter((s) => s.trim().length > 0)
    const kw = input.summary.keywords.filter((s) => s.trim().length > 0)
    if (kp.length > 0) {
      sections.push('## 关键要点')
      sections.push(kp.map((p, i) => `${i + 1}. ${p}`).join('\n'))
    }
    if (kw.length > 0) {
      sections.push('## 关键词')
      sections.push(kw.join('、'))
    }
    if (input.summary.summary && input.summary.summary.trim().length > 0) {
      sections.push('## 文档摘要')
      sections.push(input.summary.summary.trim())
    }
  }

  // —— 章节采样首段（每章 ≤ 800 字符）——
  if (input.chapterSamples.length > 0) {
    sections.push('## 章节首段采样')
    for (const s of input.chapterSamples) {
      sections.push(`### ${s.title}`)
      sections.push(s.content.trim())
    }
  }

  // —— 出题指令 ——
  sections.push('---')
  sections.push(buildAnchor(input.config))

  return sections.join('\n\n')
}

function buildAnchor(config: QuizConfig): string {
  const types = config.questionTypes.join(' / ')
  return [
    '现在请基于上述素材出题。',
    `数量：${config.count} 道；题型可选范围：${types}。`,
    '所有题目都必须能够从上述素材中找到依据，避免引入素材之外的知识点。',
    '请严格按 system 给出的 JSON 形式输出。'
  ].join('\n')
}

// ---------------------------------------------------------------------------
// outline formatting
// ---------------------------------------------------------------------------

/**
 * 格式化 outline 为缩进文本（保留前两层）：
 *
 *   - 第一章 引言
 *     - 1.1 背景
 *     - 1.2 范围
 *
 * 与 design.md `/brief` 章节地图取「outline 前两层」保持一致；过深层级对出题
 * 没有额外信号且会挤占 prompt token。
 */
function formatOutline(outline: OutlineNode[] | null): string {
  if (!outline || outline.length === 0) return ''
  const lines: string[] = []
  for (const top of outline) {
    if (top.title.trim().length === 0) continue
    lines.push(`- ${top.title.trim()}`)
    for (const child of top.children) {
      if (child.title.trim().length === 0) continue
      lines.push(`  - ${child.title.trim()}`)
    }
  }
  return lines.join('\n')
}

// 仅类型导出兜底，避免 TS isolatedModules 误删
export type { QuizQuestionType }
