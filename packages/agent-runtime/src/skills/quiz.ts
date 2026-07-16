/**
 * `/quiz` Skill Handler —— 三阶段状态机：configuring / answering / graded。
 *
 * 阶段判定（与 design.md「`/quiz` 流程总览」、requirements 7.1–7.15、tasks.md 6.9 一致）：
 *
 *   1. **configuring**：触发即新建 `agent_skill_sessions`（state.status='configuring'）
 *      → SSE `session_banner`（payload 含 `sessionId`，前端 chatSession store 据此记录）
 *      → SSE `structured_message: QuizConfigPrompt`。
 *
 *   2. **answering**（前端必须携带 sessionId、不携带 command；走 SkillRouter
 *      第二级 `mode='resume'`）：根据 `state.status='configuring'` + `params.config`
 *      推进。**进入 LLM 出题前严格校验 `config.count ∈ [1, 10]` 整数**：违反立即
 *      `sse.error` + throw（前端 input 仅为 UI 限制，后端不依赖前端校验）。
 *      通过后调用 LLMTool.completeJson 一次性生成 N 题，schema 强约束
 *      `{ type, stem, options?, correctAnswer }`：`type ∈ {single, multi, fill, short}`，
 *      `options` 当且仅当 `type ∈ {single, multi}` 时存在，`correctAnswer` 与 type 匹配。
 *      `questions.length === config.count`（不允许隐式截断或补全）。
 *      持久化到 state（含 `correctAnswer`，仅服务端可见）；返回
 *      `structured_message: QuizGroupCard` —— payload **必须**经
 *      `stripCorrectAnswers(questions)` 脱敏。
 *
 *   3. **graded**（前端必须携带 sessionId、不携带 command；同样 mode='resume'）：
 *      根据 `state.status='answering'` + `params.answers` 推进。**用 DB 完整 state
 *      比对生成评分**（不调 LLM——本期为简化用 trim + 大小写不敏感比对，design.md
 *      约定）。返回 `structured_message: QuizResultCard`：`{ results[], score: 0-100 }`。
 *
 * 答案脱敏强制：DB `state.questions[i].correctAnswer` 完整保留；任何投递前端的
 * QuizGroupCard payload（含 sessionId 恢复路径）都必须经 `stripCorrectAnswers` 剥离。
 *
 * 超时：出题 45s、评分 30s（评分本地比对，超时主要约束 DB upsert，留给上层）。
 *
 * Validates: Requirements 7.1–7.15, 15.3, 15.8
 */

import { z } from 'zod'

import type { SSEStreamHandle } from '../sse/stream'
import type { SkillSession, SkillSessionState } from '../types/session'
import { completeJson, LLMValidationError } from '../tools/llm'
import { getOutline, getChapterChunks, type OutlineNode } from '../tools/outline'
import { getSummary, type DocumentSummary } from '../tools/summary'
import * as SessionTool from '../tools/session'
import { buildQuizGenerationPrompt } from '../prompts/quiz'
import type { SkillContext, SkillHandler } from './types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type QuizQuestionType = 'single' | 'multi' | 'fill' | 'short'
export type QuizDifficulty = 'recall' | 'understand' | 'apply'
export type QuizConfigDifficulty = QuizDifficulty | 'mixed'

export interface QuizConfig {
  questionTypes: QuizQuestionType[]
  /** 题量；后端必须独立校验 ∈ [1, 10] 整数 */
  count: number
  difficulty?: QuizConfigDifficulty
}

/**
 * 持久化在 `agent_skill_sessions.state.questions[]` 的完整题目（**含**
 * `correctAnswer`）。投递给前端前**必须**经 `stripCorrectAnswers` 剥离。
 */
export interface QuizQuestion {
  index: number
  type: QuizQuestionType
  difficulty: QuizDifficulty
  question: string
  /** 仅 single / multi 存在 */
  options?: string[]
  /** single → string；multi → string[]；fill / short → string */
  correctAnswer: unknown
}

/** 投递给前端的脱敏题目（无 correctAnswer 字段） */
export type QuizQuestionPublic = Omit<QuizQuestion, 'correctAnswer'>

export interface QuizGradingResultItem {
  questionIndex: number
  correct: boolean
  explanation: string
}

export interface QuizSessionState extends SkillSessionState {
  status: 'configuring' | 'answering' | 'graded' | 'ended' | 'interrupted'
  config?: QuizConfig
  questions?: QuizQuestion[]
  userAnswers?: Record<number, unknown>
  gradingResult?: QuizGradingResultItem[]
}

export interface RunQuizSkillInput {
  /** 已由 Route Handler 校验过的用户 ID */
  userId: string
  /** 已由 Route Handler 校验过归属的文档 ID */
  documentId: string
  /** 来自前端的结构化参数（configuring 阶段空；answering 阶段含 `config`；graded 阶段含 `answers`） */
  params?: Record<string, unknown>
  /** 多轮 session id（answering / graded 阶段必填） */
  sessionId?: string
  /** 取消信号（直通 LLM 调用） */
  abortSignal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUIZ_TYPE_VALUES: readonly QuizQuestionType[] = ['single', 'multi', 'fill', 'short']
const QUIZ_CONFIG_DIFFICULTY_VALUES: readonly QuizConfigDifficulty[] = [
  'recall',
  'understand',
  'apply',
  'mixed'
]

const QUIZ_GENERATION_TIMEOUT_MS = 45_000
/** 章节采样最大条数；超过会拖长 prompt 同时 marginal benefit 低 */
const MAX_CHAPTER_SAMPLES = 6
/** 单章节首段截取上限（字符），控制 prompt token */
const CHAPTER_SAMPLE_CHAR_LIMIT = 800

const QUIZ_CONFIG_PROMPT_PAYLOAD = {
  availableTypes: ['single', 'multi', 'fill', 'short'] as const,
  maxCount: 10 as const,
  difficulties: ['recall', 'understand', 'apply', 'mixed'] as const
}

// ---------------------------------------------------------------------------
// LLM JSON schema —— `{ type, stem, options?, correctAnswer }` 联合
// ---------------------------------------------------------------------------

/**
 * 强约束 schema：使用 `z.discriminatedUnion('type', ...)` 让 zod 在 type 不匹配时
 * 直接拒绝，避免 single/multi 缺 options 或 fill/short 多 options 的语义漂移。
 *
 * 注意：discriminatedUnion 默认允许未知字段（zod object 默认 strip）。LLM 偶尔
 * 在 fill/short 上多塞 `options` 字段时会被静默剔除，最终持久化的 `QuizQuestion`
 * 仍严格符合「`options` 当且仅当 type ∈ {single, multi} 时存在」的契约（Property 8）。
 *
 * 字段命名：LLM 端使用 `stem`（与 task hint 对齐），handler 内部归一化为
 * `question`（与 design.md `QuizQuestion.question` 对齐），跨界字段一一映射。
 */
const generationItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    stem: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctAnswer: z.string().min(1),
    difficulty: z.enum(['recall', 'understand', 'apply']).optional()
  }),
  z.object({
    type: z.literal('multi'),
    stem: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctAnswer: z.array(z.string().min(1)).min(1),
    difficulty: z.enum(['recall', 'understand', 'apply']).optional()
  }),
  z.object({
    type: z.literal('fill'),
    stem: z.string().min(1),
    correctAnswer: z.string().min(1),
    difficulty: z.enum(['recall', 'understand', 'apply']).optional()
  }),
  z.object({
    type: z.literal('short'),
    stem: z.string().min(1),
    correctAnswer: z.string().min(1),
    difficulty: z.enum(['recall', 'understand', 'apply']).optional()
  })
])

const generationSchema = z.object({
  questions: z.array(generationItemSchema).min(1).max(10)
})

type GeneratedQuestion = z.infer<typeof generationItemSchema>

// ---------------------------------------------------------------------------
// stripCorrectAnswers —— 投递前端前强制脱敏
// ---------------------------------------------------------------------------

/**
 * 剥离每道题的 `correctAnswer` 字段，得到对前端安全的 `QuizQuestionPublic[]`。
 *
 * 任何返回前端的 QuizGroupCard payload（首次出题 / sessionId 恢复路径）都
 * **必须**经此函数脱敏。配合 `agent_skill_sessions` 表的 service-role-only RLS
 * 形成「DB 完整 / 前端脱敏」双视图（design.md Security Considerations）。
 *
 * 导出以便 Skill Handler、Route Handler（`/api/ai/sessions`）以及单元测试复用。
 */
export function stripCorrectAnswers(questions: readonly QuizQuestion[]): QuizQuestionPublic[] {
  return questions.map((q) => {
    // 解构忽略 correctAnswer，结构上保证 returned 对象不含该字段（不是仅设为 undefined）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { correctAnswer: _ignored, ...rest } = q
    return rest
  })
}

// ---------------------------------------------------------------------------
// Errors（Skill 内部抛错；上层 runAgent .catch → SSE error，已写过帧的不会重复）
// ---------------------------------------------------------------------------

class QuizConfigInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizConfigInvalidError'
  }
}

class QuizGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizGenerationError'
  }
}

class QuizGradingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizGradingError'
  }
}

// ---------------------------------------------------------------------------
// runQuizSkill —— Skill Handler 入口
// ---------------------------------------------------------------------------

/**
 * 三阶段判定：
 *   - activeSession 不存在                                 → configuring（fresh）
 *   - state.status='configuring' + params.config 存在      → answering（resume）
 *   - state.status='answering'   + params.answers 存在     → graded（resume）
 *   - 其他（含 reload / 杂讯输入）                          → 重新投递当前阶段对应卡片
 *
 * 副作用：
 *   - DB 写：SessionTool.upsert（每阶段一次）
 *   - SSE：session_banner（configuring 含 sessionId、answering 含 progress）
 *          + structured_message: {QuizConfigPrompt|QuizGroupCard|QuizResultCard}
 *   - 错误写帧 + throw 让 runAgent 收尾终止帧（createSSEStream.error 幂等）
 */
export async function runQuizSkill(input: RunQuizSkillInput, sse: SSEStreamHandle): Promise<void> {
  const activeSession = input.sessionId
    ? await SessionTool.load(input.sessionId, input.userId, input.documentId)
    : null

  // ---- Phase 1: configuring（fresh）----
  if (!activeSession) {
    return runConfiguringPhase(input, sse)
  }

  const state = activeSession.state as QuizSessionState
  const params = input.params ?? {}

  // ---- Phase 2: answering（state=configuring + params.config）----
  if (state.status === 'configuring' && hasOwn(params, 'config')) {
    return runAnsweringPhase(input, sse, activeSession, params.config)
  }

  // ---- Phase 3: graded（state=answering + params.answers）----
  if (state.status === 'answering' && hasOwn(params, 'answers')) {
    return runGradedPhase(input, sse, activeSession, params.answers)
  }

  // ---- 兜底：重新投递当前阶段卡片（前端 reload / 杂讯输入）----
  return resumeCurrentPhase(activeSession, sse)
}

function hasOwn<K extends string>(
  obj: Record<string, unknown>,
  key: K
): obj is Record<K, unknown> & Record<string, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

// ---------------------------------------------------------------------------
// Phase 1: configuring
// ---------------------------------------------------------------------------

async function runConfiguringPhase(input: RunQuizSkillInput, sse: SSEStreamHandle): Promise<void> {
  const initialState: QuizSessionState = { status: 'configuring' }

  const session = await SessionTool.upsert({
    userId: input.userId,
    documentId: input.documentId,
    skill: '/quiz',
    state: initialState
  })

  // 先发 banner（含 sessionId）让前端 chatSession store 立刻记录，再发表单卡。
  // 顺序保证：用户即便在卡片渲染前刷新，也已经持有 sessionId。
  sse.send({
    event: 'session_banner',
    skill: '/quiz',
    status: 'active',
    sessionId: session.id
  })

  sse.send({
    event: 'structured_message',
    messageType: 'QuizConfigPrompt',
    payload: {
      availableTypes: [...QUIZ_CONFIG_PROMPT_PAYLOAD.availableTypes],
      maxCount: QUIZ_CONFIG_PROMPT_PAYLOAD.maxCount,
      difficulties: [...QUIZ_CONFIG_PROMPT_PAYLOAD.difficulties]
    }
  })
}

// ---------------------------------------------------------------------------
// Phase 2: answering
// ---------------------------------------------------------------------------

async function runAnsweringPhase(
  input: RunQuizSkillInput,
  sse: SSEStreamHandle,
  session: SkillSession,
  rawConfig: unknown
): Promise<void> {
  // —— 严格校验 config（含 count ∈ [1, 10] 整数）；违反立即拒绝整个请求 ——
  let config: QuizConfig
  try {
    config = parseAndValidateConfig(rawConfig)
  } catch (err) {
    const msg = err instanceof QuizConfigInvalidError ? err.message : 'invalid /quiz config'
    sse.error(`/quiz config invalid: ${msg}`)
    throw err instanceof Error ? err : new QuizConfigInvalidError(msg)
  }

  // —— 拉 outline / summary / 章节首段做 prompt 上下文 ——
  const [outline, summary] = await Promise.all([
    getOutline(input.documentId, input.userId),
    getSummary(input.documentId, input.userId)
  ])
  const chapterSamples = await collectChapterSamples(outline, input.userId, input.documentId)

  // —— 调 LLM completeJson（schema 严格 + 自动重试一次）——
  const prompt = buildQuizGenerationPrompt({
    config,
    outline,
    summary,
    chapterSamples
  })

  let generated: { questions: GeneratedQuestion[] }
  try {
    generated = await completeJson(prompt, generationSchema, {
      abortSignal: input.abortSignal,
      timeoutMs: QUIZ_GENERATION_TIMEOUT_MS,
      // 略带创造性以拉开题目分布；保留 0.3 兼顾稳定与多样
      temperature: 0.3,
      // 10 道题 × ~300 token/题 + JSON 结构开销 ≈ 4000；留余量
      maxTokens: 6000
    })
  } catch (err) {
    // LLMValidationError 已经被 LLMTool 内部重试一次后抛出 → 终极失败：发 error 终止流
    if (err instanceof LLMValidationError) {
      sse.error('/quiz: LLM 输出 JSON 格式校验失败')
      throw err
    }
    throw err
  }

  // —— 强制 questions.length === config.count（不允许隐式截断或补全）——
  if (generated.questions.length !== config.count) {
    const msg = `expected ${config.count} questions but got ${generated.questions.length}`
    sse.error(`/quiz generation failed: ${msg}`)
    throw new QuizGenerationError(msg)
  }

  // —— 归一化为持久化结构（stem → question；难度兜底 deriveDifficulty）——
  const questions: QuizQuestion[] = generated.questions.map((q, idx) =>
    normalizeQuestion(q, idx, config)
  )

  // —— 持久化（含 correctAnswer，仅服务端可见）——
  const newState: QuizSessionState = {
    status: 'answering',
    config,
    questions,
    userAnswers: {}
  }
  await SessionTool.upsert({
    id: session.id,
    userId: input.userId,
    documentId: input.documentId,
    skill: '/quiz',
    state: newState
  })

  // —— 投递 banner + 脱敏题组卡（顺序：banner 先于卡片让 SessionBanner 立即出现）——
  sse.send({
    event: 'session_banner',
    skill: '/quiz',
    status: 'active',
    progress: { current: 0, total: questions.length }
  })

  sse.send({
    event: 'structured_message',
    messageType: 'QuizGroupCard',
    payload: {
      questions: stripCorrectAnswers(questions)
    }
  })
}

/**
 * 严格校验 raw config：
 *   - 必须为对象
 *   - questionTypes 非空数组、每项 ∈ {single, multi, fill, short}
 *   - count 为 [1, 10] 闭区间内的整数
 *   - difficulty 缺省默认 'mixed'，存在时必须 ∈ {recall, understand, apply, mixed}
 */
function parseAndValidateConfig(raw: unknown): QuizConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new QuizConfigInvalidError('config must be an object')
  }
  const obj = raw as Record<string, unknown>

  const types = obj.questionTypes
  if (!Array.isArray(types) || types.length === 0) {
    throw new QuizConfigInvalidError('config.questionTypes must be a non-empty array')
  }
  const questionTypes: QuizQuestionType[] = []
  for (const t of types) {
    if (typeof t !== 'string' || !QUIZ_TYPE_VALUES.includes(t as QuizQuestionType)) {
      throw new QuizConfigInvalidError(`config.questionTypes contains invalid value: ${String(t)}`)
    }
    if (!questionTypes.includes(t as QuizQuestionType)) {
      questionTypes.push(t as QuizQuestionType)
    }
  }

  const count = obj.count
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) {
    throw new QuizConfigInvalidError(
      `config.count must be an integer in [1, 10] (got ${String(count)})`
    )
  }

  let difficulty: QuizConfigDifficulty | undefined
  if (obj.difficulty !== undefined && obj.difficulty !== null) {
    if (
      typeof obj.difficulty !== 'string' ||
      !QUIZ_CONFIG_DIFFICULTY_VALUES.includes(obj.difficulty as QuizConfigDifficulty)
    ) {
      throw new QuizConfigInvalidError(
        `config.difficulty must be one of ${QUIZ_CONFIG_DIFFICULTY_VALUES.join(' / ')}`
      )
    }
    difficulty = obj.difficulty as QuizConfigDifficulty
  }

  const result: QuizConfig = { questionTypes, count }
  if (difficulty !== undefined) result.difficulty = difficulty
  return result
}

/**
 * 把 LLM 出题的 `{ stem, ... }` 归一化为 design.md `QuizQuestion`：
 *   - stem → question
 *   - 难度缺省时按 config.difficulty 兜底（mixed → understand）
 *   - 类型分支构造 options / correctAnswer 字段，确保「options 当且仅当
 *     type ∈ {single, multi} 时存在」
 */
function normalizeQuestion(
  raw: GeneratedQuestion,
  index: number,
  config: QuizConfig
): QuizQuestion {
  const difficulty: QuizDifficulty = raw.difficulty ?? deriveDifficulty(config)
  const base = {
    index,
    type: raw.type,
    difficulty,
    question: raw.stem
  }
  switch (raw.type) {
    case 'single':
      return {
        ...base,
        type: 'single',
        options: raw.options,
        correctAnswer: raw.correctAnswer
      }
    case 'multi':
      return {
        ...base,
        type: 'multi',
        options: raw.options,
        correctAnswer: raw.correctAnswer
      }
    case 'fill':
      return { ...base, type: 'fill', correctAnswer: raw.correctAnswer }
    case 'short':
      return { ...base, type: 'short', correctAnswer: raw.correctAnswer }
  }
}

/**
 * 难度缺省回落：
 *   - mixed / 缺省 → 'understand'（中位难度，避免极端）
 *   - 其他直接透传
 *
 * 实际多样化（mixed）应由 LLM 在每题上自行打 difficulty；本函数仅作 LLM 漏标时的兜底。
 */
function deriveDifficulty(config: QuizConfig): QuizDifficulty {
  const d = config.difficulty
  if (!d || d === 'mixed') return 'understand'
  return d
}

/**
 * 取 outline 顶层章节的首段 chunk 作为 prompt 上下文采样。
 *
 * 设计权衡：
 *   - 仅取顶层章节（不递归子章节）—— 题量上限 10，prompt 不需要太细的素材
 *   - 每章首段 ≤ 800 字符（约 200-300 token），最多 6 章 ≈ 1200-1800 token
 *   - outline 缺失或为空 → 返回 []，prompt 走「无章节素材」分支由 LLM 凭 summary 出题
 */
async function collectChapterSamples(
  outline: OutlineNode[] | null,
  userId: string,
  documentId: string
): Promise<{ title: string; content: string }[]> {
  if (!outline || outline.length === 0) return []

  const samples: { title: string; content: string }[] = []
  for (const node of outline) {
    if (samples.length >= MAX_CHAPTER_SAMPLES) break
    const chunks = await getChapterChunks(documentId, userId, node.headingPath)
    if (chunks.length === 0) continue
    const first = chunks[0]
    const title = node.title || node.headingPath.join(' / ') || `章节 ${samples.length + 1}`
    samples.push({
      title,
      content: first.content.slice(0, CHAPTER_SAMPLE_CHAR_LIMIT)
    })
  }
  return samples
}

// ---------------------------------------------------------------------------
// Phase 3: graded
// ---------------------------------------------------------------------------

async function runGradedPhase(
  input: RunQuizSkillInput,
  sse: SSEStreamHandle,
  session: SkillSession,
  rawAnswers: unknown
): Promise<void> {
  const state = session.state as QuizSessionState
  const questions = state.questions ?? []
  if (questions.length === 0) {
    sse.error('/quiz: no questions to grade')
    throw new QuizGradingError('no questions in session state')
  }

  const userAnswers = parseUserAnswers(rawAnswers)

  // —— 本地比对（不调 LLM）：trim + 大小写不敏感等值；multi 排序后逐项比 ——
  const results: QuizGradingResultItem[] = questions.map((q) => {
    const userAnswer = userAnswers[q.index]
    const correct = compareAnswer(q, userAnswer)
    return {
      questionIndex: q.index,
      correct,
      explanation: buildExplanation(q, userAnswer, correct)
    }
  })

  const correctCount = results.filter((r) => r.correct).length
  const score = Math.round((correctCount / results.length) * 100)

  // —— 持久化 ——
  const newState: QuizSessionState = {
    ...state,
    status: 'graded',
    userAnswers,
    gradingResult: results
  }
  await SessionTool.upsert({
    id: session.id,
    userId: input.userId,
    documentId: input.documentId,
    skill: '/quiz',
    state: newState
  })

  // —— 投递 QuizResultCard（不再发 banner：design.md session_banner 的
  //    status 枚举 {active, ended, interrupted} 不含 graded；前端通过
  //    QuizResultCard 的出现自然完成「测验已完成」的视觉过渡）——
  sse.send({
    event: 'structured_message',
    messageType: 'QuizResultCard',
    payload: {
      results,
      score
    }
  })
}

/**
 * 把 `params.answers` 归一化为 `Record<number, unknown>`（key 为 question.index）。
 *
 * 接受形态：
 *   - `{ [index: string]: answer }`：常见 JSON 提交格式（key 为字符串数字）
 *   - `Array<answer | undefined>`：按 index 顺序提交
 *
 * 非法形态（非对象 / 数组）→ 返回 {} 让评分阶段全错（用户漏提交则 0 分）。
 */
function parseUserAnswers(raw: unknown): Record<number, unknown> {
  if (!raw) return {}
  const out: Record<number, unknown> = {}
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== undefined) out[i] = raw[i]
    }
    return out
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const idx = Number(k)
      if (Number.isInteger(idx) && idx >= 0) out[idx] = v
    }
    return out
  }
  return {}
}

/** 标准化字符串：trim + 折叠空白 + 转小写。用于 fill/short/single 的本地比对。 */
function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

function compareAnswer(q: QuizQuestion, userAnswer: unknown): boolean {
  const correct = q.correctAnswer
  switch (q.type) {
    case 'single':
      return (
        typeof userAnswer === 'string' &&
        typeof correct === 'string' &&
        normalizeText(userAnswer) === normalizeText(correct)
      )

    case 'multi': {
      if (!Array.isArray(userAnswer) || !Array.isArray(correct)) return false
      if (userAnswer.length !== correct.length) return false
      const ua = userAnswer.map((a) => (typeof a === 'string' ? normalizeText(a) : '')).sort()
      const ca = correct.map((a) => (typeof a === 'string' ? normalizeText(a) : '')).sort()
      return ua.every((v, i) => v === ca[i])
    }

    case 'fill':
    case 'short':
      return (
        typeof userAnswer === 'string' &&
        typeof correct === 'string' &&
        normalizeText(userAnswer) === normalizeText(correct)
      )
  }
}

function buildExplanation(q: QuizQuestion, userAnswer: unknown, correct: boolean): string {
  const userText = formatAnswer(userAnswer)
  const correctText = formatAnswer(q.correctAnswer)
  if (correct) {
    return `回答正确，正确答案为：${correctText}`
  }
  if (userText.length === 0) {
    return `未作答。正确答案为：${correctText}`
  }
  return `你的答案为「${userText}」；正确答案为：${correctText}`
}

function formatAnswer(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((v) => String(v)).join('、')
  return String(value)
}

// ---------------------------------------------------------------------------
// 兜底：重发当前阶段卡片（前端 reload / 杂讯输入）
// ---------------------------------------------------------------------------

async function resumeCurrentPhase(session: SkillSession, sse: SSEStreamHandle): Promise<void> {
  const state = session.state as QuizSessionState

  if (state.status === 'configuring') {
    sse.send({
      event: 'session_banner',
      skill: '/quiz',
      status: 'active',
      sessionId: session.id
    })
    sse.send({
      event: 'structured_message',
      messageType: 'QuizConfigPrompt',
      payload: {
        availableTypes: [...QUIZ_CONFIG_PROMPT_PAYLOAD.availableTypes],
        maxCount: QUIZ_CONFIG_PROMPT_PAYLOAD.maxCount,
        difficulties: [...QUIZ_CONFIG_PROMPT_PAYLOAD.difficulties]
      }
    })
    return
  }

  if (state.status === 'answering' && state.questions && state.questions.length > 0) {
    const total = state.questions.length
    const answered = state.userAnswers ? Object.keys(state.userAnswers).length : 0
    sse.send({
      event: 'session_banner',
      skill: '/quiz',
      status: 'active',
      progress: { current: answered, total }
    })
    sse.send({
      event: 'structured_message',
      messageType: 'QuizGroupCard',
      payload: {
        questions: stripCorrectAnswers(state.questions)
      }
    })
    return
  }

  if (state.status === 'graded' && state.gradingResult && state.gradingResult.length > 0) {
    const total = state.gradingResult.length
    const correctCount = state.gradingResult.filter((r) => r.correct).length
    const score = Math.round((correctCount / total) * 100)
    sse.send({
      event: 'structured_message',
      messageType: 'QuizResultCard',
      payload: {
        results: state.gradingResult,
        score
      }
    })
    return
  }

  // 异常状态（ended / interrupted / 数据不一致）：让前端隐藏 banner
  sse.send({
    event: 'session_banner',
    skill: '/quiz',
    status: state.status === 'interrupted' ? 'interrupted' : 'ended'
  })
}

// ---------------------------------------------------------------------------
// SkillHandler 注册（供 SkillRegistry / orchestrator dispatch 调用）
// ---------------------------------------------------------------------------

/**
 * 与 `runQuizSkill` 等价的 SkillHandler 形态包装；orchestrator 在 6.x 全部完工后
 * 把 `dispatchSkill` 中的 `case '/quiz'` 替换为 `await quizSkill.handle(ctx)` 即可。
 */
export const quizSkill: SkillHandler = {
  name: '/quiz',
  async handle(ctx: SkillContext): Promise<void> {
    await runQuizSkill(
      {
        userId: ctx.userId,
        documentId: ctx.documentId,
        params: ctx.params,
        sessionId: ctx.sessionId,
        abortSignal: ctx.abortSignal
      },
      ctx.sse
    )
  }
}

// ---------------------------------------------------------------------------
// 便于测试 / Route Handler 复用的内部工具显式导出（namespace 风格，避免污染主接口）
// ---------------------------------------------------------------------------

export const __quizInternals = {
  parseAndValidateConfig,
  normalizeQuestion,
  parseUserAnswers,
  compareAnswer,
  buildExplanation,
  collectChapterSamples,
  generationSchema
} as const

// 规避 unused 警告：DocumentSummary 类型仅在内部 prompt builder 间接使用，
// 通过下面的 type-only re-export 同时保留对外公开 API（便于其他 Skill 复用类型）
export type { DocumentSummary, OutlineNode }
