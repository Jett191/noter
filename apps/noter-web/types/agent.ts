/**
 * Noter Agent — 前端类型定义。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` 与 `requirements.md`：
 *   • 共享 / 协议层类型（SkillName / SkillManifest / SSEEvent / SSEEventName）
 *     直接从 `@noter/agent-runtime` re-export，避免前后端漂移。
 *   • 前端专属类型（ChatMessage / 各 Card payload / FollowUpChip 镜像 /
 *     QuizQuestion 公共脱敏版本）独立定义在本文件，前端组件按 messageType
 *     分支渲染时直接消费这些 payload 接口。
 *
 * 关键安全约束（与后端契合）：
 *   • 前端的 `QuizQuestion` 对应后端 `QuizQuestionPublic`，**不含**
 *     `correctAnswer` 字段。后端 `agent-runtime/src/skills/quiz.ts` 中保留
 *     完整 `QuizQuestion`（含 correctAnswer），任何 SSE 投递前都必须经
 *     `stripCorrectAnswers` 脱敏。前端永不应见到 correctAnswer。
 *   • SSEEvent 联合类型来自后端，前端仅消费、不下发同结构事件。
 */

import type { SkillManifest, SkillName, SSEEvent, SSEEventName } from '@noter/agent-runtime'

// ===== 协议层共享类型（re-export） =====

export type { SkillName, SkillManifest, SSEEvent, SSEEventName }

// ===== 结构化卡片 messageType 枚举 =====

/**
 * SSE `structured_message.messageType` 取值集合。
 *
 * 与后端 `packages/agent-runtime/src/types/sse.ts` 中的同名类型保持镜像；
 * 后端没有从 index.ts re-export 它，因此前端在此独立声明。任何新增 card
 * 必须同步更新两边。
 */
export type StructuredMessageType =
  | 'BriefCard'
  | 'TutorTurnCard'
  | 'ExplainCard'
  | 'ActionsCard'
  | 'QuizConfigPrompt'
  | 'QuizGroupCard'
  | 'QuizResultCard'

// ===== Follow-up chip（单轮 Skill 末尾的下一步建议） =====

/**
 * 单条 follow-up chip。
 *
 * SSE `follow_ups` 事件 payload 中 `chips: FollowUpChip[]`；点击 chip 等同
 * 触发对应 SkillLaunchpad 卡片（fresh 模式）。
 */
export interface FollowUpChip {
  /** 按钮文案，例如「考考我 📝」 */
  label: string
  /** 跳转的 Skill */
  command: SkillName
  /** 可选透传参数（例如 `/explain` 的 concept 改写） */
  params?: Record<string, unknown>
}

// ===== /brief Card payload =====

/** /brief 章节地图条目（取自 outline 前两层） */
export interface BriefChapterMapEntry {
  /** heading 层级，1-6 */
  level: number
  title: string
}

/** 推荐阅读路径，受限取值 */
export type BriefReadingPath = 'sequential' | 'skim' | 'deep_dive'

/**
 * BriefCard payload —— 五区块速览。
 *
 * 后端 schema 见 `packages/agent-runtime/src/prompts/brief.ts:briefOutputSchema`。
 */
export interface BriefPayload {
  /** 文档类型，例如「论文 / 教程 / 报告 / 博客 / 其他」 */
  docType: string
  /** 核心主张，一句话 */
  thesis: string
  /** 章节地图：取 outline 前两层 */
  chapterMap: BriefChapterMapEntry[]
  /** 适合谁读 */
  audience: string
  /** 推荐阅读路径 */
  readingPath: BriefReadingPath
}

// ===== /tutor Card payload =====

/**
 * TutorTurnCard payload —— 私教单轮。
 *
 * 多轮 Skill：进度由独立的 `session_banner` 事件推送，不放在 payload 里。
 * 后端 send 见 `packages/agent-runtime/src/skills/tutor.ts`。
 */
export interface TutorTurnPayload {
  /** 当前章节标题 */
  chapterTitle: string
  /** 当前章节序号（0-based） */
  chapterIndex: number
  /** 总章节数 */
  totalChapters: number
  /** 200-400 字核心讲解（markdown） */
  explanation: string
  /** 一道引导问题 */
  question: string
}

// ===== /explain Card payload =====

/** /explain 引用片段：每条都来自真实 chunk，禁止 LLM 编造 */
export interface ExplainReference {
  chunkId: string
  headingPath: string[]
  /** 截取后的原文片段（后端默认 ≤ 400 字符） */
  snippet: string
}

/**
 * ExplainCard payload —— 概念释疑。
 *
 * 0 命中降级时 markdown 以「⚠️ 此解释非来自当前文档：」开头、references = []。
 */
export interface ExplainPayload {
  /** 用户查询的概念 */
  concept: string
  /** 100-300 字解释（markdown） */
  markdown: string
  /** 来自当前文档的引用片段（0 命中时为空数组） */
  references: ExplainReference[]
}

// ===== /actions Card payload =====

/**
 * ActionsCard payload —— 行动项三栏（纯展示，不可勾选 / 不写回 notes）。
 *
 * 后端约束：todos ≤ 20、conceptsToLearn ≤ 8、readingSuggestions ≤ 5。
 */
export interface ActionsPayload {
  todos: string[]
  conceptsToLearn: string[]
  readingSuggestions: string[]
}

// ===== /quiz 共享类型 =====

/** 题型枚举 */
export type QuizQuestionType = 'single' | 'multi' | 'fill' | 'short'

/** 题目难度枚举（题级别） */
export type QuizDifficulty = 'recall' | 'understand' | 'apply'

/** 配置阶段难度选项（含 mixed 整体策略） */
export type QuizConfigDifficulty = QuizDifficulty | 'mixed'

/**
 * /quiz 配置请求体（前端 QuizConfigPrompt 表单提交时透传到后端 params.config）。
 *
 * 后端会在进入 answering 阶段前**严格校验** `count ∈ [1, 10]` 整数；
 * 前端 input 的 min/max 仅作 UI 限制，不替代后端校验。
 */
export interface QuizConfig {
  /** 题型多选，至少一项 */
  questionTypes: QuizQuestionType[]
  /** 题量，必须是 [1, 10] 闭区间整数 */
  count: number
  /** 难度策略，默认 mixed */
  difficulty?: QuizConfigDifficulty
}

/**
 * 前端可见的题目结构——**对应后端的 `QuizQuestionPublic`，不含 `correctAnswer`**。
 *
 * answering 阶段后端通过 SSE QuizGroupCard 投递的 questions 数组使用此形状；
 * sessionId 恢复路径同样必须脱敏后投递。前端组件不应在任何路径下读取
 * `correctAnswer` —— 一旦出现，应视为后端漏脱敏的安全 bug。
 */
export interface QuizQuestion {
  /** 题号（0-based） */
  index: number
  type: QuizQuestionType
  difficulty: QuizDifficulty
  /** 题干 */
  question: string
  /** 选项；当且仅当 type ∈ {single, multi} 时存在 */
  options?: string[]
}

/** 单题评分结果 */
export interface QuizGradingResultItem {
  questionIndex: number
  correct: boolean
  /** 解析文案（含正确答案 + 用户作答对比） */
  explanation: string
}

// ===== /quiz Card payload =====

/**
 * QuizConfigPrompt payload —— 配置阶段表单元数据。
 *
 * 后端发送此 payload 时**同帧**会先发一条 `session_banner` 事件携带 sessionId；
 * 前端 chatSession store 必须在该 banner 事件中记录 sessionId，后续 answering /
 * graded 提交都通过 sessionId 续签（mode='resume'），**不**附带 command='/quiz'。
 */
export interface QuizConfigPayload {
  /** 可选题型（与 QuizQuestionType 同步） */
  availableTypes: ReadonlyArray<QuizQuestionType>
  /** 题量上限（后端硬约束 10） */
  maxCount: number
  /** 可选难度（含 'mixed'） */
  difficulties: ReadonlyArray<QuizConfigDifficulty>
}

/**
 * QuizGroupCard payload —— 答题阶段题组。
 *
 * questions 中**不含 correctAnswer**（后端在投递前已通过 stripCorrectAnswers 脱敏）。
 */
export interface QuizGroupPayload {
  questions: QuizQuestion[]
}

/**
 * QuizResultCard payload —— 评分阶段结果与总分。
 *
 * 后端用 DB 中完整 state.questions 比对生成，前端仅展示。
 */
export interface QuizResultPayload {
  results: QuizGradingResultItem[]
  /** 0-100 总分（四舍五入到整数） */
  score: number
}

// ===== 结构化消息 payload 联合（按 messageType 区分） =====

/**
 * `messageType → payload` 映射，便于前端组件按 messageType 收窄类型。
 *
 * 例如：
 * ```ts
 * function renderCard<T extends StructuredMessageType>(
 *   type: T,
 *   payload: StructuredPayloadMap[T],
 * ) { ... }
 * ```
 */
export interface StructuredPayloadMap {
  BriefCard: BriefPayload
  TutorTurnCard: TutorTurnPayload
  ExplainCard: ExplainPayload
  ActionsCard: ActionsPayload
  QuizConfigPrompt: QuizConfigPayload
  QuizGroupCard: QuizGroupPayload
  QuizResultCard: QuizResultPayload
}

// ===== ChatMessage（前端本地消息） =====

/**
 * 前端会话中渲染的一条消息。
 *
 * 与后端 SSE `messages` 数组（仅含 role + content）不同：
 *   • 含本地 `id` / `createdAt`，供 React key 与时间轴使用
 *   • `messageType` 缺省时按纯文本渲染（content 走 markdown）；
 *     非缺省时按对应 Card 组件分支渲染，content 字段允许保留兜底文本
 *   • `followUps` 来自 SSE `follow_ups` 事件，绑定到当前消息末尾以 chip 渲染
 *   • `payload` 类型为 unknown，前端组件按 messageType 收窄到
 *     `StructuredPayloadMap[messageType]` 后消费
 */
export interface ChatMessage {
  /** 客户端生成的临时 id（uuid 或自增），仅作 React key */
  id: string
  role: 'user' | 'assistant'
  /** 文本内容；纯文本消息存放 markdown，结构化消息可留空或放兜底文案 */
  content: string
  /** 结构化消息类型；缺省表示纯文本 */
  messageType?: StructuredMessageType
  /**
   * 结构化消息 payload；按 `messageType` 收窄到对应接口。
   * 可消费时建议这样收窄：
   *   `if (msg.messageType === 'BriefCard') (msg.payload as BriefPayload)`
   */
  payload?: unknown
  /** 创建时间戳（ms，Date.now()） */
  createdAt: number
  /** 单轮 Skill 末尾的 follow-up chips */
  followUps?: FollowUpChip[]
  /**
   * 仅 assistant 占位消息使用：当 SSE 还未下发任何内容时挂一条带 isLoading=true 的
   * 占位消息，前端渲染 typing 动画；第一帧 content 到达时改为 false 转为正文流式。
   */
  isLoading?: boolean
  /**
   * 仅前端展示用的"合成"消息（例如用户点 SkillLaunchpad 卡片时生成的伪用户气泡，
   * 或多轮 Quiz 卡内提交生成的"提交答卷"气泡）。这类消息**不**进入发往后端的
   * `messages` 历史数组——后端接收的对话历史只包含真实键入的 user / assistant 文本。
   */
  synthetic?: boolean
}
