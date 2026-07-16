/**
 * SkillRouter —— 三级优先级路由（本期第二级不调用 OnTopic_Classifier）。
 *
 * 入参 → `RouteDecision`：
 *   1. **第一级（显式 command 直达）**：`input.command` 非空 → 选用 command 指定的 Skill，
 *      `mode='fresh'`；若 `activeSession` 存在且 skill 不同则把它放进 `switchFromSession`，
 *      由 orchestrator 后续编排 interrupt + banner + 系统提示。
 *   2. **第二级（多轮 session 续签）**：`activeSession` 存在且 skill ∈ {`/tutor`, `/quiz`} →
 *      `mode='resume'`，把用户消息（或 params）整体作为 params 传给 Skill Handler。
 *      **本期不调用 OnTopic_Classifier、不发送 off_topic_notice**。
 *   3. **第三级（自然语言慢路径）**：调用 `classifyIntent` 走关键词 + LLM 兜底意图分类，
 *      未命中由分类器内部按 `general_qa` → `/brief` 顺序回落。
 *
 * 关键约束（design.md「Skill Router 设计」与 tasks.md Task 4.2 / 4.5）：
 *   - **Router 是纯函数**：仅输入 → 输出 `RouteDecision`，**不**调用
 *     `SessionTool.interrupt`、**不**推送 SSE、**不**注入系统提示、**不**发送 clarification 事件。
 *     这些副作用全部由 orchestrator 在拿到 `RouteDecision` 后顺序执行（见 Task 4.5）。
 *   - 由于第三级需要 `await classifyIntent(...)`，本函数整体返回 `Promise<RouteDecision>`。
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 2.8
 */

import { classifyIntent } from './intent'
import type { SkillName } from '../types/skill'
import type { SkillSession } from '../types/session'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteDecision {
  /** 路由命中的 Skill */
  skill: SkillName
  /** 传给 Skill Handler 的参数（fresh 时来自 input.params 或 intent；resume 时来自结构化提交或消息回包） */
  params: Record<string, unknown>
  /** fresh = 全新启动该 Skill；resume = 续签已存在的多轮 session */
  mode: 'fresh' | 'resume'
  /**
   * 若 Router 检测到 Skill 切换（command 与活跃 session 的 skill 不同），
   * 把旧 session 放在此字段；orchestrator 据此先 interrupt 旧 session、
   * 推送 session_banner、注入系统提示，然后才启动新 Skill。
   * Router 自身不执行任何上述副作用。
   */
  switchFromSession?: SkillSession
}

export interface SkillRouterInput {
  /** 来自 SkillLaunchpad 卡片点击 / SlashCommandMenu 选中的显式 Skill */
  command?: SkillName
  /** 显式触发携带的结构化参数（如 /quiz 配置 / answers、/explain concept） */
  params?: Record<string, unknown>
  /** 用户最近一次自然语言消息（用于第三级慢路径意图分类，与 resume 时回包） */
  message?: string
  /** 调用方传入的 sessionId（仅用于上层加载 activeSession，Router 内部不需要直接使用） */
  sessionId?: string
  /**
   * 已加载的多轮 session（仅 `/tutor` / `/quiz` 才有意义）；
   * 由调用方在 SessionTool.load() 后注入。Router 不负责加载。
   */
  activeSession?: SkillSession
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/**
 * 可续签（mode='resume'）的多轮 Skill 集合。
 * `/brief`、`/explain`、`/actions` 是单轮 Skill，命中活跃 session 时不进入续签分支。
 */
const RESUMABLE_SKILLS: ReadonlySet<SkillName> = new Set<SkillName>(['/tutor', '/quiz'])

// ---------------------------------------------------------------------------
// route(input)
// ---------------------------------------------------------------------------

export async function route(input: SkillRouterInput): Promise<RouteDecision> {
  // -------------------------------------------------------------------------
  // 第一级：显式 command 直达（最高优先级）
  // -------------------------------------------------------------------------
  if (input.command) {
    const skill = input.command
    const switchFrom =
      input.activeSession && input.activeSession.skill !== skill ? input.activeSession : undefined

    const decision: RouteDecision = {
      skill,
      params: input.params ?? {},
      mode: 'fresh'
    }
    if (switchFrom) {
      decision.switchFromSession = switchFrom
    }
    return decision
  }

  // -------------------------------------------------------------------------
  // 第二级：多轮 session 进行中 → 续签（不调用 OnTopic_Classifier、不发 off_topic_notice）
  // -------------------------------------------------------------------------
  if (input.activeSession && RESUMABLE_SKILLS.has(input.activeSession.skill)) {
    return {
      skill: input.activeSession.skill,
      params: buildResumeParams(input),
      mode: 'resume'
    }
  }

  // -------------------------------------------------------------------------
  // 第三级：自然语言慢路径意图分类（关键词 + LLM 兜底；未命中由分类器内部回落 /brief）
  // -------------------------------------------------------------------------
  const message = input.message?.trim()
  if (!message) {
    throw new Error(
      'SkillRouter: cannot route input without `command`, resumable `activeSession`, or non-empty `message`'
    )
  }

  const intent = await classifyIntent(message)
  return {
    skill: intent.skill,
    params: intent.params ?? {},
    mode: 'fresh'
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * 构造 resume 模式下传给 Skill Handler 的 params：
 *   - 调用方提供了非空 `params`（结构化表单提交，如 `/quiz` 的 `{ config }` / `{ answers }`）
 *     → 优先使用，原样透传
 *   - 否则把用户消息整体包成 `{ message }`，让 Skill Handler 自行解析
 *     （`/tutor` 每轮答题、`/quiz` 自由文本输入等场景）
 *   - 两者都没有时返回 `{}`，让 Skill Handler 走默认分支
 *
 * 不做合并（`params` 与 `message` 的语义在前端是互斥的）。
 */
function buildResumeParams(input: SkillRouterInput): Record<string, unknown> {
  const params = input.params
  if (params && Object.keys(params).length > 0) {
    return params
  }
  if (typeof input.message === 'string' && input.message.length > 0) {
    return { message: input.message }
  }
  return {}
}
