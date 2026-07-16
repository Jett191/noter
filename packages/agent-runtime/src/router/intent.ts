/**
 * 慢路径意图分类（关键词 + LLM 兜底）。
 *
 * 调用次序（保持纯函数：仅返回结果，不产生 DB / SSE 副作用）：
 *   1. 关键词匹配（按 /brief → /tutor → /explain → /actions → /quiz 顺序检查）
 *      命中后立即返回，对 /explain 同时尝试用正则提取 concept
 *   2. 关键词未命中时调用 LLMTool.completeJson 让 LLM 输出 JSON
 *   3. LLM 失败 / 异常 / 仍无明显匹配 → 按 (a) `general_qa` 若已注册 / (b) 否则
 *      回落到 `/brief`。本期 SkillRegistry 中未注册 `general_qa`，实际回落为 `/brief`
 *
 * 中文优先 + 英文兜底关键词表：
 * - /brief    速览 / 快速了解 / 这是什么 / 先看看 / 简介 / brief
 * - /tutor    教我 / 私教 / 带我读 / 逐章讲 / 给我讲讲 / 学一遍 / tutor
 * - /explain  什么是 X / X 是什么意思 / 解释一下 X / 啥是 X / 解释 / explain
 * - /actions  我读完了 / 接下来做什么 / 行动项 / 待办 / 下一步 / todo / actions
 * - /quiz     考考我 / 测试 / 出题 / 测一下 / 来道题 / 考试 / quiz
 *
 * 测试时可通过 `opts.llmEnabled = false` 强制走纯关键词路径，保证 unit / property
 * test 的纯函数语义（无网络 IO）。
 *
 * Validates: Requirements 14.3, 14.4
 */

import { z } from 'zod'

import { completeJson, LLMRequestError, LLMTimeoutError, LLMValidationError } from '../tools/llm'
import { getSkill } from '../skills/registry'
import type { SkillName } from '../types/skill'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClassifyIntentOptions {
  /** 默认 true。设为 false 时跳过 LLM 兜底，纯关键词 → fallback 路径 */
  llmEnabled?: boolean
  /** 透传给 LLMTool.completeJson 的取消信号 */
  abortSignal?: AbortSignal
}

export interface IntentResult {
  skill: SkillName
  /** 仅在能从消息或 LLM 输出中提取到具体参数时给出（典型如 /explain 的 concept） */
  params?: Record<string, unknown>
  /** 命中渠道：keyword / llm / fallback */
  source: 'keyword' | 'llm' | 'fallback'
}

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

/**
 * 关键词匹配按 (skill, keywords[]) 元组的顺序检查；同一 skill 内任一关键词命中
 * 即视为该 skill 命中（首次命中立即返回，后续 skill 不再检查）。
 *
 * 顺序与 task 4.4 关键词表保持一致：brief → tutor → explain → actions → quiz。
 * 把 /explain 放在 /actions、/quiz 之前是为了让「解释一下…」这类祈使句优先归类
 * 为概念释疑而不是被「测试」「下一步」等弱信号词截胡。
 */
const KEYWORD_ROUTES: ReadonlyArray<{ skill: SkillName; keywords: readonly string[] }> = [
  {
    skill: '/brief',
    keywords: ['速览', '快速了解', '这是什么', '先看看', '简介', 'brief']
  },
  {
    skill: '/tutor',
    keywords: ['教我', '私教', '带我读', '逐章讲', '给我讲讲', '学一遍', 'tutor']
  },
  {
    skill: '/explain',
    keywords: ['什么是', '是什么意思', '解释一下', '啥是', '解释', 'explain']
  },
  {
    skill: '/actions',
    keywords: ['我读完了', '接下来做什么', '行动项', '待办', '下一步', 'todo', 'actions']
  },
  {
    skill: '/quiz',
    keywords: ['考考我', '测试', '出题', '测一下', '来道题', '考试', 'quiz']
  }
]

/**
 * /explain concept 提取正则，按特异性从严到宽排序：
 * - 「什么是 X」「解释一下 X」「啥是 X」「explain X」从触发短语之后取概念
 * - 「X 是什么意思」从「是什么意思」之前取概念
 * - 「解释 X」放在最后（避免误吞「解释一下」前缀）
 *
 * 概念允许的字符：去除首尾空白与常见结尾标点（? ？ ！ . 。 ， ,）。
 */
const CONCEPT_PATTERNS: ReadonlyArray<RegExp> = [
  /什么是\s*([^?？！。.，,]+)/,
  /解释一下\s*([^?？！。.，,]+)/,
  /啥是\s*([^?？！。.，,]+)/,
  /\bexplain\s+([^?？！。.，,]+)/i,
  /([^\s?？！。.，,][^?？！。.，,]*?)\s*是什么意思/,
  /解释\s+([^?？！。.，,]+)/
]

// ---------------------------------------------------------------------------
// LLM JSON schema
// ---------------------------------------------------------------------------

const SKILL_NAME_VALUES: readonly [SkillName, ...SkillName[]] = [
  '/brief',
  '/tutor',
  '/explain',
  '/actions',
  '/quiz'
]

const intentJsonSchema = z.object({
  skill: z.enum(SKILL_NAME_VALUES),
  concept: z.string().trim().min(1).optional()
})

// ---------------------------------------------------------------------------
// classifyIntent
// ---------------------------------------------------------------------------

/**
 * 把自然语言消息映射到 5 个 Skill 之一。Router 第三级慢路径调用此函数。
 *
 * 行为契约：
 * - 始终 resolve 一个 IntentResult，不会 reject（LLM 异常吞掉走 fallback）
 * - 关键词命中：source='keyword'
 * - LLM 命中：source='llm'
 * - 全部失败：source='fallback'，skill 按以下顺序回落：
 *     (a) `general_qa` 若已注册（本期 SkillRegistry 未注册）
 *     (b) `/brief`
 */
export async function classifyIntent(
  message: string,
  opts: ClassifyIntentOptions = {}
): Promise<IntentResult> {
  const trimmed = (message ?? '').trim()
  // 空消息直接走 fallback，避免无意义的 LLM 调用
  if (trimmed.length === 0) {
    return buildFallback()
  }

  // ---- 关键词匹配 ----
  const keywordHit = matchKeyword(trimmed)
  if (keywordHit) {
    return keywordHit
  }

  // ---- LLM 兜底（可被 opts.llmEnabled = false 关闭以保持纯函数） ----
  const llmEnabled = opts.llmEnabled ?? true
  if (llmEnabled) {
    try {
      const llmHit = await classifyWithLLM(trimmed, opts.abortSignal)
      if (llmHit) {
        return llmHit
      }
    } catch (err) {
      // 任意 LLM 错误都吞掉走 fallback：Requirements 13.3 在 Skill Handler 层做
      // 重试，Router 层不再叠加重试，避免双重重试放大延迟
      if (
        err instanceof LLMRequestError ||
        err instanceof LLMTimeoutError ||
        err instanceof LLMValidationError
      ) {
        // 已知错误：吞掉
      } else if (err instanceof Error && err.name === 'AbortError') {
        // 调用方主动取消：吞掉走 fallback
      } else {
        // 未知错误：同样吞掉，Router 不抛错
      }
    }
  }

  return buildFallback()
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * 关键词命中判定。同一 skill 内任一关键词命中即返回；/explain 命中时尝试提取
 * concept；其他 skill 不带 params。
 *
 * 对英文关键词做 case-insensitive 匹配（通过提前 lowercase）；中文关键词不区分
 * 大小写没有意义，直接子串匹配。
 */
function matchKeyword(message: string): IntentResult | null {
  const lower = message.toLowerCase()
  for (const route of KEYWORD_ROUTES) {
    for (const kw of route.keywords) {
      const needle = kw.toLowerCase()
      if (lower.includes(needle)) {
        if (route.skill === '/explain') {
          const concept = extractConcept(message)
          return {
            skill: '/explain',
            params: concept ? { concept } : {},
            source: 'keyword'
          }
        }
        return { skill: route.skill, source: 'keyword' }
      }
    }
  }
  return null
}

/**
 * 从消息中尝试提取 /explain 的 concept 参数。
 * 命中第一条匹配的正则即返回；提取失败返回 undefined（由 Skill Handler
 * 自身的「无 concept 反问」分支兜底）。
 */
function extractConcept(message: string): string | undefined {
  for (const pattern of CONCEPT_PATTERNS) {
    const m = message.match(pattern)
    if (m && typeof m[1] === 'string') {
      const concept = m[1].trim().replace(/^[?？！。.，,\s]+|[?？！。.，,\s]+$/g, '')
      if (concept.length > 0) return concept
    }
  }
  return undefined
}

/**
 * LLM 兜底分类：调用 MiMo LLM 输出 JSON `{ skill, concept? }`，由 zod 校验。
 * 失败 / 异常由调用方捕获走 fallback；本函数只关心「能否产出合法 IntentResult」。
 */
async function classifyWithLLM(
  message: string,
  abortSignal?: AbortSignal
): Promise<IntentResult | null> {
  const systemPrompt = [
    'You are the intent classifier for a single-document AI reading agent.',
    'Classify the user message into EXACTLY ONE of these skills:',
    '- "/brief": user wants a quick overview / scan of the document',
    '- "/tutor": user wants chapter-by-chapter tutoring / guided reading',
    '- "/explain": user wants a specific concept explained (extract that concept)',
    '- "/actions": user wants action items / todos / next steps after reading',
    '- "/quiz": user wants quiz questions to test their understanding',
    '',
    'Output JSON only:',
    '{ "skill": "/brief" | "/tutor" | "/explain" | "/actions" | "/quiz", "concept"?: "..." }',
    '',
    'Include "concept" ONLY when skill is "/explain".',
    'Do not invent skills. Pick the single best fit; default to "/brief" if truly ambiguous.'
  ].join('\n')

  const userPrompt = `User message: ${message}`

  const result = await completeJson(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    intentJsonSchema,
    {
      abortSignal,
      // 分类任务低温度，强约束输出
      temperature: 0,
      // 单次分类不需要长输出，512 token 足够覆盖最长的 concept
      maxTokens: 512,
      // 慢路径意图分类整体 8s 超时（Router 阶段不应阻塞主流程过久）
      timeoutMs: 8_000
    }
  )

  if (result.skill === '/explain') {
    return {
      skill: '/explain',
      params: result.concept ? { concept: result.concept } : {},
      source: 'llm'
    }
  }
  return { skill: result.skill, source: 'llm' }
}

/**
 * 仍无明显匹配时的回落策略：
 *   (a) `general_qa` 若已注册到 SkillRegistry
 *   (b) 否则回落到 `/brief`
 *
 * `general_qa` 在本期 SkillRegistry 中未注册，但保留显式探测以避免后续新增 Skill
 * 时漏改 Router；getSkill 抛错即视为未注册。
 */
function buildFallback(): IntentResult {
  if (isSkillRegistered('general_qa' as SkillName)) {
    return { skill: 'general_qa' as SkillName, source: 'fallback' }
  }
  return { skill: '/brief', source: 'fallback' }
}

function isSkillRegistered(name: SkillName): boolean {
  try {
    getSkill(name)
    return true
  } catch {
    return false
  }
}
