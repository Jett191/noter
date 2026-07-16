/**
 * `/tutor` Skill Handler —— 章节私教多轮交互。
 *
 * 见 design.md「`/tutor` — 章节私教」与 requirements.md 需求 4。
 *
 * 一轮 /tutor 的流程（fresh 与 resume 共用「启动一章」尾段）：
 *
 *   1. **fresh 启动**
 *      a. 读 outline；缺失 → 取 markdown_content 按字数 5 等分作为虚拟章节
 *      b. 初始化 TutorSessionState（status='active'、currentChapterIndex=0、
 *         understanding=50、exchangeHistory=[]）
 *      c. INSERT agent_skill_sessions
 *      d. 走「启动一章」尾段（推 banner → 取章节内容 → LLM 出 explanation+question
 *         → 推 structured_message → UPDATE state.currentTopic）
 *
 *   2. **resume 续签**
 *      a. 校验 activeSession.skill === '/tutor'；否则视为编程错误
 *      b. 若 params.exit === true → 标记 ended、推 banner ended、不再做后续
 *      c. 取最近一条 user message 作为答题文本
 *      d. LLM 评估 good / partial / confused；追加 exchangeHistory；
 *         understanding 累计（good +15、partial +5、confused -5，clamp 0-100）
 *      e. 章节推进：good → 下一章；partial / confused → 留在同章再来一题（retry）
 *      f. 若已超过最后一章（i.e. nextIndex >= totalChapters 且 good）→
 *         标记 ended、推 banner ended、可选 content 总结
 *      g. 否则走「启动一章」尾段
 *
 *   3. **启动一章（fresh / advance / retry 共用）**
 *      - 推 `session_banner` `{ skill: '/tutor', status: 'active', progress }`
 *      - getChapterChunks(headingPath) → compressChapterChunks(8000)
 *        - needsLLMSummary 为 true → 走章节级 LLM 摘要压缩（截断 input ≤ 12000 字）
 *      - LLM completeJson → `{ explanation, question }`
 *      - 推 `structured_message: TutorTurnCard`（不发 follow_ups）
 *      - UPDATE session state（currentChapterIndex、currentTopic、
 *        exchangeHistory、understanding）
 *
 * 时间预算：单轮 30s（design.md「超时」/ Req 4.11 / Req 15.7）。整段流程通过
 * 派生的 AbortController 强制 abort，转手传给所有 LLM / DB 调用。
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.11, 4.12,
 *            10.5, 15.2, 15.7
 */

import { z } from 'zod'

import { tutorPrompts } from '../prompts/tutor'
import * as LLMTool from '../tools/llm'
import * as OutlineTool from '../tools/outline'
import * as SessionTool from '../tools/session'
import type { SSEStreamHandle } from '../sse/stream'
import type { SkillSession, SkillSessionState } from '../types/session'
import type { ChunkHit } from '../types/tool'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Skill Handler 的统一入参。orchestrator 后续会负责传入 `mode`、`activeSession`
 * 等额外字段（目前 dispatchSkill 占位中尚未传，详见 Task 6.3 注释）。
 *
 * 与现有 `SkillContext`（skills/types.ts）相比新增：
 *   - `mode`: 区分 fresh / resume 路径（Router 已在 RouteDecision 中产出）
 *   - `activeSession?`: resume / Skill 退出处理需要 session 行
 *
 * 命名为 `SkillHandlerInput` 以便与 `OrchestratorInput` 区分（后者面向最外层
 * runOrchestrator）。
 */
export interface SkillHandlerInput {
  userId: string
  documentId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  params: Record<string, unknown>
  abortSignal?: AbortSignal
  mode: 'fresh' | 'resume'
  /** resume 时必传；fresh 时若用户已有同 Skill 活跃 session（理论上 Router
   *  会先把它放到 switchFromSession 里被打断）则不会传入此字段。 */
  activeSession?: SkillSession
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 单轮硬超时：30s（design.md「超时」表 + Req 4.11） */
const TUTOR_TURN_TIMEOUT_MS = 30_000

/** 章节内容压缩上限：≤ 8000 token（design.md /tutor 检索段） */
const CHAPTER_TOKEN_BUDGET = 8000

/** 章节级 LLM 摘要压缩输入截断：超长章节最多喂 12000 字给 LLM 让它自己压成 ≤1500 字 */
const CHAPTER_SUMMARY_INPUT_CHAR_LIMIT = 12_000

/** outline 缺失时虚拟章节数（design.md「降级」段：按字数等分 5 块） */
const VIRTUAL_CHAPTER_COUNT = 5

/** TurnCard explanation 字数上限（粗保护，prompt 已要求 200-400 字） */
const EXPLANATION_MAX_LEN = 1200
/** TurnCard question 字数上限（粗保护） */
const QUESTION_MAX_LEN = 400

/** understanding 累计步进 */
const UNDERSTANDING_STEP_GOOD = 15
const UNDERSTANDING_STEP_PARTIAL = 5
const UNDERSTANDING_STEP_CONFUSED = -5

// ---------------------------------------------------------------------------
// State / chapter types
// ---------------------------------------------------------------------------

/**
 * /tutor 单轮记录（与 design.md `TutorSessionState.exchangeHistory[]` 对齐）。
 */
export interface TutorExchange {
  question: string
  userAnswer: string
  assessment: 'good' | 'partial' | 'confused'
}

/**
 * /tutor 会话状态完整结构（与 design.md `TutorSessionState` 严格对齐）。
 *
 * 注意：`status` 在 SkillSessionState 中定义为联合类型；此处收紧到
 * /tutor 自身允许的三档（'active' | 'ended' | 'interrupted'）。
 */
export interface TutorSessionState extends SkillSessionState {
  status: 'active' | 'ended' | 'interrupted'
  currentChapterIndex: number
  totalChapters: number
  currentTopic: string
  understanding: number
  exchangeHistory: TutorExchange[]
}

/** 章节切片（真实 outline 节点 / 虚拟字数等分块共用） */
interface Chapter {
  /** 章节序号（0-based） */
  index: number
  /** 展示用标题 */
  title: string
  /** 真实章节：outline 节点的 headingPath；虚拟章节：null（按 markdown 切块） */
  headingPath: string[] | null
  /** 仅虚拟章节使用：直接预切好的 markdown 文本 */
  fallbackContent?: string
}

// ---------------------------------------------------------------------------
// Zod schemas（LLM JSON 输出校验）
// ---------------------------------------------------------------------------

const turnSchema = z.object({
  explanation: z.string().min(1).max(EXPLANATION_MAX_LEN),
  question: z.string().min(1).max(QUESTION_MAX_LEN)
})
type TurnPayload = z.infer<typeof turnSchema>

const evalSchema = z.object({
  assessment: z.enum(['good', 'partial', 'confused'])
})

const chapterSummarySchema = z.object({
  summary: z.string().min(1)
})

// ---------------------------------------------------------------------------
// Public entry: runTutorSkill(input, sse)
// ---------------------------------------------------------------------------

export async function runTutorSkill(input: SkillHandlerInput, sse: SSEStreamHandle): Promise<void> {
  // —— 全程 abort：外部信号 ∪ 30s 单轮超时 ——
  const turnAbort = combineAbort(input.abortSignal, TUTOR_TURN_TIMEOUT_MS)

  try {
    // ── 退出处理（最高优先级；fresh / resume 都可能附带 params.exit）──
    if (input.params?.exit === true) {
      await handleExit(input, sse)
      return
    }

    if (input.mode === 'resume') {
      await handleResume(input, sse, turnAbort.signal)
    } else {
      await handleFresh(input, sse, turnAbort.signal)
    }
  } finally {
    turnAbort.dispose()
  }
}

// ---------------------------------------------------------------------------
// fresh：首次启动 /tutor
// ---------------------------------------------------------------------------

async function handleFresh(
  input: SkillHandlerInput,
  sse: SSEStreamHandle,
  abortSignal: AbortSignal
): Promise<void> {
  // 1. 切章节（outline 优先，缺失则虚拟字数等分）
  const chapters = await loadChapters(input.documentId, input.userId)
  if (chapters.length === 0) {
    // outline 与 markdown 双双缺失：Req 15.2 提示文档未完成解析
    throw new Error('文档未完成解析或向量化，无法启动 /tutor')
  }

  // 2. 初始化 state（首章 currentTopic 取首章标题）
  const initialState: TutorSessionState = {
    status: 'active',
    currentChapterIndex: 0,
    totalChapters: chapters.length,
    currentTopic: chapters[0].title,
    understanding: 50,
    exchangeHistory: []
  }

  // 3. INSERT session（不带 id → SessionTool.upsert 走 INSERT 分支）
  const session = await SessionTool.upsert({
    userId: input.userId,
    documentId: input.documentId,
    skill: '/tutor',
    state: initialState
  })

  // 4. 启动第一章
  await startChapterTurn({
    input,
    sse,
    session,
    chapters,
    state: initialState,
    abortSignal,
    lastAssessment: null,
    retryOnSameChapter: false
  })
}

// ---------------------------------------------------------------------------
// resume：用户答完上一题，推进章节
// ---------------------------------------------------------------------------

async function handleResume(
  input: SkillHandlerInput,
  sse: SSEStreamHandle,
  abortSignal: AbortSignal
): Promise<void> {
  if (!input.activeSession) {
    throw new Error('runTutorSkill: resume mode requires `activeSession`')
  }
  if (input.activeSession.skill !== '/tutor') {
    throw new Error(
      `runTutorSkill: activeSession.skill must be '/tutor', got ${input.activeSession.skill}`
    )
  }

  const session = input.activeSession
  const prevState = normalizeState(
    session.state,
    /* fallback */ {
      status: 'active',
      currentChapterIndex: 0,
      totalChapters: 0,
      currentTopic: '',
      understanding: 50,
      exchangeHistory: []
    }
  )

  // session 处于已结束 / 已中断态：只推一个 ended banner 让前端兜底（理论 Router
  // 不会把已过期 session 传到这里，但作为防御性分支）
  if (prevState.status !== 'active') {
    sse.send({
      event: 'session_banner',
      skill: '/tutor',
      status: prevState.status === 'interrupted' ? 'interrupted' : 'ended'
    })
    return
  }

  // 1. 重新切章节（确保 totalChapters / chapter title 与当前 outline 一致）
  const chapters = await loadChapters(input.documentId, input.userId)
  if (chapters.length === 0) {
    throw new Error('文档未完成解析或向量化，无法继续 /tutor')
  }
  // outline 变化导致 totalChapters 改变时，仍按当前 chapters 长度推进
  const totalChapters = chapters.length

  // 2. 取本轮用户回答（来自 messages 末尾的 user 消息；params.message 也可作为
  //    Router resume 时的回包；优先 messages，因为它包含实际历史）
  const userAnswer =
    pickLastUserMessage(input.messages) ??
    (typeof input.params?.message === 'string' ? (input.params.message as string) : '') ??
    ''

  // 3. LLM 评估当前章节回答
  const currentIdx = clampIndex(prevState.currentChapterIndex, totalChapters)
  const currentChapter = chapters[currentIdx]
  // 当前轮提问优先取 state.pendingQuestion（上一轮 startChapterTurn 写入的占位字段，
  // 此时尚未追加到 exchangeHistory）；否则回落到 exchangeHistory 末尾的 question。
  // 这样在「首轮 fresh → 用户首次答题」时也能拿到 question 文本用于评估。
  const pendingQuestionRaw = (prevState as Record<string, unknown>).pendingQuestion
  const pendingQuestion = typeof pendingQuestionRaw === 'string' ? pendingQuestionRaw : ''
  const lastExchangeQuestion =
    prevState.exchangeHistory.length > 0
      ? prevState.exchangeHistory[prevState.exchangeHistory.length - 1].question
      : ''
  const questionForEval = pendingQuestion || lastExchangeQuestion

  // 取出当前章节内容用于评估（可能很长 → 评估只用 ≤ 4000 char 节选即可）
  const evalContent = (
    await loadChapterContent(input.userId, input.documentId, currentChapter, abortSignal)
  ).slice(0, 4000)

  let assessment: TutorExchange['assessment']
  try {
    const evalRes = await LLMTool.completeJson(
      [
        { role: 'system', content: tutorPrompts.evalSystem },
        {
          role: 'user',
          content: tutorPrompts.evalUser({
            chapterTitle: currentChapter.title,
            chapterContent: evalContent,
            // 当前轮提问优先来自 pendingQuestion（首轮答题专用），
            // 兜底用 exchangeHistory 末尾 question。
            question: questionForEval,
            userAnswer
          })
        }
      ],
      evalSchema,
      {
        abortSignal,
        timeoutMs: TUTOR_TURN_TIMEOUT_MS,
        temperature: 0.0
      }
    )
    assessment = evalRes.assessment
  } catch (err) {
    if (isAbort(err)) throw err
    // LLM 评估失败：保守判 partial（让用户在同一章再来一题，不丢用户进度）
    assessment = 'partial'
  }

  // 4. 推进 state.exchangeHistory + understanding
  const nextExchange: TutorExchange = {
    question: questionForEval,
    userAnswer,
    assessment
  }
  const nextUnderstanding = clampUnderstanding(
    prevState.understanding +
      (assessment === 'good'
        ? UNDERSTANDING_STEP_GOOD
        : assessment === 'partial'
          ? UNDERSTANDING_STEP_PARTIAL
          : UNDERSTANDING_STEP_CONFUSED)
  )

  // 5. 章节推进：good → 下一章；partial/confused → 留在同章 retry
  const advanceToNextChapter = assessment === 'good'
  const nextChapterIndex = advanceToNextChapter ? currentIdx + 1 : currentIdx

  // 6. 已经超出最后一章：标记 ended 并通知前端
  if (nextChapterIndex >= totalChapters) {
    const endedState: TutorSessionState = {
      ...prevState,
      status: 'ended',
      currentChapterIndex: totalChapters, // 越界以便前端识别已读完
      totalChapters,
      understanding: nextUnderstanding,
      exchangeHistory: [...prevState.exchangeHistory, nextExchange]
    }
    await SessionTool.upsert({
      id: session.id,
      userId: input.userId,
      documentId: input.documentId,
      skill: '/tutor',
      state: endedState,
      expiresAt: new Date().toISOString()
    })
    sse.send({
      event: 'session_banner',
      skill: '/tutor',
      status: 'ended',
      progress: { current: totalChapters, total: totalChapters }
    })
    sse.send({
      event: 'content',
      content: '🎉 全部章节已读完，本次私教结束。期待下一篇见！'
    })
    return
  }

  // 7. 推进到下一章 / 同章 retry
  const nextChapter = chapters[nextChapterIndex]
  const nextState: TutorSessionState = {
    ...prevState,
    currentChapterIndex: nextChapterIndex,
    totalChapters,
    currentTopic: nextChapter.title,
    understanding: nextUnderstanding,
    exchangeHistory: [...prevState.exchangeHistory, nextExchange]
  }

  await startChapterTurn({
    input,
    sse,
    session,
    chapters,
    state: nextState,
    abortSignal,
    lastAssessment: assessment,
    retryOnSameChapter: !advanceToNextChapter
  })
}

// ---------------------------------------------------------------------------
// 退出处理（params.exit === true）
// ---------------------------------------------------------------------------

async function handleExit(input: SkillHandlerInput, sse: SSEStreamHandle): Promise<void> {
  const session = input.activeSession
  if (!session) {
    // 没有 session 时直接静默：前端按 'ended' 兜底
    sse.send({ event: 'session_banner', skill: '/tutor', status: 'ended' })
    return
  }

  const prevState = normalizeState(session.state, {
    status: 'ended',
    currentChapterIndex: 0,
    totalChapters: 0,
    currentTopic: '',
    understanding: 50,
    exchangeHistory: []
  })

  const endedState: TutorSessionState = {
    ...prevState,
    status: 'ended'
  }

  await SessionTool.upsert({
    id: session.id,
    userId: input.userId,
    documentId: input.documentId,
    skill: '/tutor',
    state: endedState,
    expiresAt: new Date().toISOString()
  })

  sse.send({
    event: 'session_banner',
    skill: '/tutor',
    status: 'ended',
    progress: {
      current: prevState.currentChapterIndex,
      total: prevState.totalChapters
    }
  })
}

// ---------------------------------------------------------------------------
// startChapterTurn：fresh / advance / retry 共用尾段
// ---------------------------------------------------------------------------

interface StartChapterTurnArgs {
  input: SkillHandlerInput
  sse: SSEStreamHandle
  session: SkillSession
  chapters: Chapter[]
  /** **未持久化**的下一轮 state（本函数会写回 DB） */
  state: TutorSessionState
  abortSignal: AbortSignal
  lastAssessment: TutorExchange['assessment'] | null
  /** partial / confused 的同章重讲场景 */
  retryOnSameChapter: boolean
}

async function startChapterTurn(args: StartChapterTurnArgs): Promise<void> {
  const { input, sse, session, chapters, state, abortSignal } = args
  const chapter = chapters[state.currentChapterIndex]

  // 1. 推 banner active（每轮先发；progress.current 用 1-based 章节序号让 UI 友好）
  sse.send({
    event: 'session_banner',
    skill: '/tutor',
    status: 'active',
    progress: {
      current: state.currentChapterIndex + 1,
      total: state.totalChapters
    }
  })

  // 2. 取章节内容 + 必要时章节级 LLM 摘要压缩
  const chapterContent = await loadChapterContent(
    input.userId,
    input.documentId,
    chapter,
    abortSignal
  )

  // 3. LLM 出 explanation + question
  const turn = await generateTurn({
    chapterTitle: chapter.title,
    chapterContent,
    lastAssessment: args.lastAssessment,
    understanding: state.understanding,
    retryOnSameChapter: args.retryOnSameChapter,
    abortSignal
  })

  // 4. 推 structured_message（中间轮次不发 follow_ups）
  sse.send({
    event: 'structured_message',
    messageType: 'TutorTurnCard',
    payload: {
      chapterTitle: chapter.title,
      chapterIndex: state.currentChapterIndex,
      totalChapters: state.totalChapters,
      explanation: turn.explanation,
      question: turn.question
    }
  })

  // 5. 把本轮 question 写入 exchangeHistory 占位（userAnswer 留空，等下一轮 resume 时填）
  //    设计：exchangeHistory 在 resume 阶段写入 user 反馈记录；本处仅更新章节进度 / 理解度，
  //    question 文本放在 currentTopic 旁的 transient 字段并不在 SkillSessionState 接口中——
  //    因此这里采用「只写 currentChapterIndex / currentTopic / understanding，
  //    把 question 放在 exchangeHistory 末尾占位（userAnswer='', assessment='partial'）
  //    会污染历史」。妥协方案：把 question 暂存为状态扩展键 `pendingQuestion`（jsonb 索引签名兼容），
  //    resume 时优先读取它；fallback 为最后一条 exchange.question。
  const stateToPersist: TutorSessionState & { pendingQuestion?: string } = {
    ...state,
    pendingQuestion: turn.question
  }

  await SessionTool.upsert({
    id: session.id,
    userId: input.userId,
    documentId: input.documentId,
    skill: '/tutor',
    state: stateToPersist
  })
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

interface GenerateTurnArgs {
  chapterTitle: string
  chapterContent: string
  lastAssessment: TutorExchange['assessment'] | null
  understanding: number
  retryOnSameChapter: boolean
  abortSignal: AbortSignal
}

async function generateTurn(args: GenerateTurnArgs): Promise<TurnPayload> {
  const result = await LLMTool.completeJson(
    [
      { role: 'system', content: tutorPrompts.turnSystem },
      {
        role: 'user',
        content: tutorPrompts.turnUser({
          chapterTitle: args.chapterTitle,
          chapterContent: args.chapterContent,
          lastAssessment: args.lastAssessment,
          understanding: args.understanding,
          retryOnSameChapter: args.retryOnSameChapter
        })
      }
    ],
    turnSchema,
    {
      abortSignal: args.abortSignal,
      timeoutMs: TUTOR_TURN_TIMEOUT_MS,
      temperature: 0.5
    }
  )
  return result
}

/**
 * 章节级 LLM 摘要压缩：当章节代表性采样仍超预算 / 单 chunk 极长时使用。
 * 截断输入到 12000 字以避免 prompt 自身过载（粗保护，不严格按 token）。
 */
async function summarizeChapterViaLLM(
  chapterTitle: string,
  rawContent: string,
  abortSignal: AbortSignal
): Promise<string> {
  const truncated =
    rawContent.length > CHAPTER_SUMMARY_INPUT_CHAR_LIMIT
      ? rawContent.slice(0, CHAPTER_SUMMARY_INPUT_CHAR_LIMIT) + '\n\n[原文已截断]'
      : rawContent

  const result = await LLMTool.completeJson(
    [
      { role: 'system', content: tutorPrompts.chapterSummarySystem },
      {
        role: 'user',
        content: tutorPrompts.chapterSummaryUser({
          chapterTitle,
          content: truncated
        })
      }
    ],
    chapterSummarySchema,
    {
      abortSignal,
      timeoutMs: TUTOR_TURN_TIMEOUT_MS,
      temperature: 0.2
    }
  )
  return result.summary
}

// ---------------------------------------------------------------------------
// 章节加载与压缩
// ---------------------------------------------------------------------------

/**
 * 读 outline 并切成章节列表；缺失或为空时退化为按 markdown 字数等分 5 块。
 *
 * outline 切片策略：使用顶层节点（OutlineNode[] 的根级数组）作为章节单位。
 * 顶层数量 < 1 时使用虚拟章节兜底，避免「单 H1 包了整篇文档」时仅生成一章。
 */
async function loadChapters(documentId: string, userId: string): Promise<Chapter[]> {
  const outline = await OutlineTool.getOutline(documentId, userId)
  if (outline && outline.length > 0) {
    return outline.map((node, index) => ({
      index,
      title: node.title || `第 ${index + 1} 章`,
      headingPath: node.headingPath
    }))
  }

  // 降级：按 markdown 字数等分 5 块
  const markdown = await OutlineTool.getMarkdownPrefix(documentId, userId, Number.MAX_SAFE_INTEGER)
  if (!markdown || markdown.length === 0) {
    return []
  }
  return splitMarkdownIntoVirtualChapters(markdown, VIRTUAL_CHAPTER_COUNT)
}

function splitMarkdownIntoVirtualChapters(markdown: string, count: number): Chapter[] {
  if (count <= 0 || markdown.length === 0) return []
  const chunkSize = Math.ceil(markdown.length / count)
  const chapters: Chapter[] = []
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, markdown.length)
    if (start >= markdown.length) break
    chapters.push({
      index: i,
      title: `第 ${i + 1} 部分`,
      headingPath: null,
      fallbackContent: markdown.slice(start, end)
    })
  }
  return chapters
}

/**
 * 取一章的最终拼接内容；按需走代表性采样 / LLM 摘要压缩。
 *
 * 真实章节：getChapterChunks → compressChapterChunks(8000)
 *   - needsLLMSummary=true → summarizeChapterViaLLM
 * 虚拟章节：直接使用 chapter.fallbackContent，再走一次粗略截断
 */
async function loadChapterContent(
  userId: string,
  documentId: string,
  chapter: Chapter,
  abortSignal: AbortSignal
): Promise<string> {
  // 虚拟章节路径
  if (chapter.headingPath === null) {
    const raw = chapter.fallbackContent ?? ''
    if (estimateTokens(raw) <= CHAPTER_TOKEN_BUDGET) return raw
    // 虚拟块仍超预算（极端长文档）→ 走章节级 LLM 摘要
    return summarizeChapterViaLLM(chapter.title, raw, abortSignal)
  }

  // 真实章节路径
  const chunks: ChunkHit[] = await OutlineTool.getChapterChunks(
    documentId,
    userId,
    chapter.headingPath
  )

  // 章节内 0 chunk：留空字符串让 prompt 用「文档未提供文本」兜底
  if (chunks.length === 0) return ''

  const compressed = OutlineTool.compressChapterChunks(chunks, CHAPTER_TOKEN_BUDGET)
  if (!compressed.needsLLMSummary) return compressed.content

  // 极端章节：用全量原文喂给 LLM 摘要压缩
  const raw = chunks.map((c) => c.content).join('\n\n')
  return summarizeChapterViaLLM(chapter.title, raw, abortSignal)
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function pickLastUserMessage(messages: SkillHandlerInput['messages']): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
      return m.content
    }
  }
  return undefined
}

/** token 估算：「字符数 / 3」近似（与 OutlineTool 内部一致，保持口径统一） */
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3)
}

function clampIndex(idx: number, totalChapters: number): number {
  if (!Number.isFinite(idx) || idx < 0) return 0
  if (idx >= totalChapters) return Math.max(0, totalChapters - 1)
  return Math.floor(idx)
}

function clampUnderstanding(value: number): number {
  if (!Number.isFinite(value)) return 50
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

/**
 * 把 DB 里的 jsonb state 收窄到 TutorSessionState；缺字段时用 fallback 填充。
 *
 * 容错读取既能兜住手工写入的脏数据，也能在未来 state schema 微调时不直接崩。
 */
function normalizeState(
  raw: SkillSessionState | undefined,
  fallback: TutorSessionState
): TutorSessionState {
  if (!raw) return { ...fallback }
  const status =
    raw.status === 'active' || raw.status === 'ended' || raw.status === 'interrupted'
      ? raw.status
      : fallback.status

  const currentChapterIndex =
    typeof raw.currentChapterIndex === 'number'
      ? raw.currentChapterIndex
      : fallback.currentChapterIndex
  const totalChapters =
    typeof raw.totalChapters === 'number' ? raw.totalChapters : fallback.totalChapters
  const currentTopic =
    typeof raw.currentTopic === 'string' ? raw.currentTopic : fallback.currentTopic
  const understanding =
    typeof raw.understanding === 'number'
      ? clampUnderstanding(raw.understanding)
      : fallback.understanding
  const exchangeHistory = Array.isArray(raw.exchangeHistory)
    ? (raw.exchangeHistory as unknown[]).filter((x): x is TutorExchange => {
        if (!x || typeof x !== 'object') return false
        const ex = x as Partial<TutorExchange>
        return (
          typeof ex.question === 'string' &&
          typeof ex.userAnswer === 'string' &&
          (ex.assessment === 'good' || ex.assessment === 'partial' || ex.assessment === 'confused')
        )
      })
    : fallback.exchangeHistory

  return {
    status,
    currentChapterIndex,
    totalChapters,
    currentTopic,
    understanding,
    exchangeHistory
  }
}

/**
 * 合并外部 abortSignal 与超时 timer。`dispose()` 必须在调用结束后执行清理。
 *
 * 内部 AbortController 的 reason：超时 → 'tutor turn timeout'；外部 → 透传 reason。
 */
interface CombinedAbort {
  signal: AbortSignal
  dispose: () => void
}

function combineAbort(external: AbortSignal | undefined, timeoutMs: number): CombinedAbort {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(external?.reason)

  if (external) {
    if (external.aborted) {
      ctrl.abort(external.reason)
    } else {
      external.addEventListener('abort', onAbort, { once: true })
    }
  }

  const timer = setTimeout(() => {
    ctrl.abort(new Error(`tutor turn timeout after ${timeoutMs}ms`))
  }, timeoutMs)
  // Node.js Timeout：unref 后不阻塞进程退出（测试环境友好）
  const maybeNodeTimer = timer as unknown as { unref?: () => void }
  if (typeof maybeNodeTimer.unref === 'function') maybeNodeTimer.unref()

  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    }
  }
}

function isAbort(err: unknown): boolean {
  if (!err) return false
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true
    if (err.name === 'LLMTimeoutError') return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Backward-compat default export（给老的 SkillHandler 协议占位，避免破坏 import）
// ---------------------------------------------------------------------------

import type { SkillContext, SkillHandler } from './types'

/**
 * 旧 `SkillHandler` 协议的兼容入口：把 `SkillContext` 适配成 `SkillHandlerInput`，
 * 默认 `mode='fresh'`、`activeSession` 由调用方上下文不可得 → undefined。
 *
 * orchestrator 后续重构（task 6 余下子任务）会直接调 `runTutorSkill`，
 * 此 export 仅为渐进迁移留路。
 */
export const tutorSkill: SkillHandler = {
  name: '/tutor',
  async handle(ctx: SkillContext): Promise<void> {
    await runTutorSkill(
      {
        userId: ctx.userId,
        documentId: ctx.documentId,
        messages: ctx.messages,
        params: ctx.params,
        abortSignal: ctx.abortSignal,
        mode: 'fresh'
      },
      ctx.sse
    )
  }
}
