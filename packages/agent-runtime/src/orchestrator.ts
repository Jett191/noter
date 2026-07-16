/**
 * Orchestrator —— 协调 Router → Skill → SSE，并负责 **Skill_Switch 副作用顺序**。
 *
 * 设计要点（与 design.md「Skill 切换处理（直接打断 / orchestrator 编排）」、
 * requirements 8.1–8.5、Task 4.5 一致）：
 *
 *   1. 加载 activeSession（input.sessionId 存在时调用 `SessionTool.load`；
 *      不存在 / 不归属 / 已过期返回 null，按 fresh 路径处理，不重复推 banner——
 *      sessionId 加载失败下发 `session_banner status='ended'` 是 Route Handler 的职责）。
 *   2. 调用 `SkillRouter.route(...)` 拿到 `RouteDecision`。**Router 是纯函数**：
 *      不写 DB、不发 SSE、不注入消息——所有副作用都收敛到这里。
 *   3. 若 `RouteDecision.switchFromSession` 非空，按顺序执行：
 *        a. `SessionTool.interrupt(oldSession.id, userId)` —— `affectedRows ≥ 1` 才继续；
 *           失败（rows=0 或 DB 抛错）→ 通过 SSE 发 `error: '会话切换失败'`，再 throw
 *           让 `runAgent` 的 `.catch` 走错误收尾（终止帧由 SSE 层幂等去重）。
 *        b. SSE `session_banner` 推送 `{ skill: oldSkill, status: 'interrupted' }`。
 *        c. SSE `content` 注入系统提示「已退出 ${oldLabel}，开始新的 ${newLabel}...」
 *           （label 取自 SkillManifest）。
 *        d. 启动新 Skill。
 *   4. 启动新 Skill 通过 `dispatchSkill(...)` 占位 switch；本期 Skill Handler
 *      6.1–6.9 尚未实装，统一抛 `skill not implemented` —— 由 `runAgent` 的
 *      `.catch` 转成 SSE `error` 事件下发。Task 6.x 完成后再回填实际 Handler 调用。
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { route, type RouteDecision } from './router/skill-router'
import { getSkill } from './skills/registry'
import { runBriefSkill } from './skills/brief'
import { runTutorSkill } from './skills/tutor'
import { runExplainSkill } from './skills/explain'
import { runActionsSkill } from './skills/actions'
import { runQuizSkill } from './skills/quiz'
import * as SessionTool from './tools/session'
import type { SSEStreamHandle } from './sse/stream'
import type { SkillName } from './types/skill'
import type { SkillSession } from './types/session'

export interface OrchestratorInput {
  userId: string
  documentId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  command?: SkillName
  params?: Record<string, unknown>
  sessionId?: string
  abortSignal?: AbortSignal
}

// ---------------------------------------------------------------------------
// runOrchestrator 主入口
// ---------------------------------------------------------------------------

export async function runOrchestrator(
  input: OrchestratorInput,
  sse: SSEStreamHandle
): Promise<void> {
  // —— 1. 加载 activeSession（仅当 sessionId 存在时） ——
  // 不存在 / 不归属 / 已过期 → null：交给 Router 走 fresh 路径；不在此处发 banner，
  // 那是 Route Handler 在 sessionId 校验失败时的职责（见 Task 8.4 / Req 13.5）。
  let activeSession: SkillSession | undefined
  if (input.sessionId) {
    const loaded = await SessionTool.load(input.sessionId, input.userId, input.documentId)
    if (loaded) activeSession = loaded
  }

  // —— 2. 调用 Router（纯函数，无副作用）——
  const decision = await route({
    command: input.command,
    params: input.params,
    message: pickLastUserMessage(input.messages),
    sessionId: input.sessionId,
    activeSession
  })

  // —— 3. Skill_Switch 副作用顺序：interrupt → banner → 系统提示 → 启动新 Skill ——
  if (decision.switchFromSession) {
    await handleSkillSwitch(decision.switchFromSession, decision.skill, input.userId, sse)
    // 中途失败 → handleSkillSwitch 已发 SSE error 并抛错；下方 dispatch 不会执行
    // 切换后 activeSession 已被打断，新 Skill 走 fresh 路径，需要清掉
    activeSession = undefined
  }

  // —— 4. 启动新 Skill ——
  await dispatchSkill(decision, input, sse, activeSession)
}

// ---------------------------------------------------------------------------
// Skill_Switch 编排
// ---------------------------------------------------------------------------

/**
 * 顺序执行：interrupt(rows ≥ 1) → session_banner → 系统提示 content。
 * 任一步失败：先发 SSE error('会话切换失败')，再 throw 让上层 runAgent .catch 收尾。
 *
 * 这里不在 throw 时再附带 SSE 错误推送——createSSEStream.error 是幂等的（首次调用
 * 后 closed=true），runAgent .catch 中的二次 sse.error(err) 不会覆盖此处的中文
 * 业务文案，但也不会重复写帧。
 */
async function handleSkillSwitch(
  oldSession: SkillSession,
  newSkill: SkillName,
  userId: string,
  sse: SSEStreamHandle
): Promise<void> {
  let affectedRows = 0
  try {
    affectedRows = await SessionTool.interrupt(oldSession.id, userId)
  } catch (err) {
    // DB 异常：与 rows = 0 同等处理；保留原始 err 让上层日志看到根因
    sse.error('会话切换失败')
    throw err instanceof Error ? err : new Error('failed to interrupt previous session')
  }

  if (affectedRows < 1) {
    sse.error('会话切换失败')
    throw new Error(`failed to interrupt previous session ${oldSession.id}: 0 rows affected`)
  }

  // 旧 session 已被打断 —— 推 banner 让前端立即隐藏旧进度
  sse.send({
    event: 'session_banner',
    skill: oldSession.skill,
    status: 'interrupted'
  })

  // 注入系统提示文案；label 取自 SkillManifest
  const oldLabel = skillLabelOf(oldSession.skill)
  const newLabel = skillLabelOf(newSkill)
  sse.send({
    event: 'content',
    content: `已退出 ${oldLabel}，开始新的 ${newLabel}...`
  })
}

// ---------------------------------------------------------------------------
// Skill dispatch
// ---------------------------------------------------------------------------

/**
 * 把 RouteDecision 派发到对应的 Skill Handler。
 *
 * 5 个 Handler 的统一入参契约（差异在 mode/activeSession 是否消费）：
 *   - 单轮 Skill（/brief、/explain、/actions）：忽略 mode/activeSession
 *   - 多轮 Skill（/tutor、/quiz）：mode='resume' + activeSession 触发续签
 *
 * Handler 内部抛错由 `runAgent` 的 `.catch` 转成 SSE `error` 事件下发；
 * 本函数不再重复 sse.error，只 throw 即可。
 *
 * `default` 分支的 `_exhaustive: never` 是给 TS 的 exhaustiveness check：
 * 若未来 SkillName 联合类型新增成员而忘记在此 switch 中补 case，
 * TS 会立即编译失败。
 */
async function dispatchSkill(
  decision: RouteDecision,
  input: OrchestratorInput,
  sse: SSEStreamHandle,
  activeSession: SkillSession | undefined
): Promise<void> {
  switch (decision.skill) {
    case '/brief':
      await runBriefSkill(
        {
          userId: input.userId,
          documentId: input.documentId,
          messages: input.messages,
          params: decision.params,
          abortSignal: input.abortSignal
        },
        sse
      )
      return
    case '/tutor':
      await runTutorSkill(
        {
          userId: input.userId,
          documentId: input.documentId,
          messages: input.messages,
          params: decision.params,
          abortSignal: input.abortSignal,
          mode: decision.mode,
          activeSession
        },
        sse
      )
      return
    case '/explain':
      await runExplainSkill(
        {
          userId: input.userId,
          documentId: input.documentId,
          params: decision.params,
          abortSignal: input.abortSignal
        },
        sse
      )
      return
    case '/actions':
      await runActionsSkill(
        {
          userId: input.userId,
          documentId: input.documentId,
          params: decision.params,
          abortSignal: input.abortSignal
        },
        sse
      )
      return
    case '/quiz':
      await runQuizSkill(
        {
          userId: input.userId,
          documentId: input.documentId,
          params: decision.params,
          // /quiz answering / graded 阶段需要 sessionId 续签；fresh 时为 undefined
          sessionId: activeSession?.id ?? input.sessionId,
          abortSignal: input.abortSignal
        },
        sse
      )
      return
    default: {
      const _exhaustive: never = decision.skill
      throw new Error(`unknown skill: ${String(_exhaustive)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/**
 * 从消息列表末尾向前找第一条 `role === 'user'` 且 content 非空的消息内容。
 * 找不到时返回 undefined（让 Router 第三级在没有命令也没有可续签 session 时
 * 自行抛错——这是上游编程错误的保护伞）。
 */
function pickLastUserMessage(messages: OrchestratorInput['messages']): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
      return m.content
    }
  }
  return undefined
}

/**
 * 从 SkillRegistry 取 label；未注册（理论不会发生）回退到原始 SkillName，
 * 不抛错——系统提示文案不应该因 registry 配置疏漏而打断 Skill_Switch 流程。
 */
function skillLabelOf(name: SkillName): string {
  try {
    return getSkill(name).label
  } catch {
    return name
  }
}
