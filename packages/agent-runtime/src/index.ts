/**
 * `@noter/agent-runtime` 唯一对外入口。
 *
 * 实现签名见 design.md「对外入口签名」一节。
 *
 * 调用模式（Route Handler 极薄、agent-runtime 富）：
 *   const { stream } = runAgent({ userId, documentId, messages, ... })
 *   return new Response(stream, {
 *     headers: { 'Content-Type': 'text/event-stream', ... },
 *   })
 *
 * 关键约束：
 *   1. **不**做鉴权或文档归属/状态校验（Route Handler 负责）。
 *   2. `runAgent` 必须**同步**返回 stream，绝不能 `await orchestrator`，
 *      否则 Response 会阻塞到 orchestrator 完成才下发首字节。
 *   3. orchestrator 异常 → `sse.error(err)`；正常结束 → `sse.close()`。
 *   4. 外部 abortSignal 触发 → 给 orchestrator 一个内部派生 signal 用于取消，
 *      并通过 `sse.error('aborted')` 收尾。
 */

import { runOrchestrator } from './orchestrator'
import { createSSEStream } from './sse/stream'
import type { SkillName } from './types/skill'

export interface RunAgentInput {
  /** 已由 Route Handler 校验过的用户 ID */
  userId: string
  /** 已由 Route Handler 校验过归属的文档 ID */
  documentId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** 显式触发的 Skill 命令（如 `/brief`） */
  command?: SkillName
  /** Skill 参数（如 /explain 的 concept、/quiz 的 config / answers） */
  params?: Record<string, unknown>
  /** 多轮 session id（/tutor、/quiz） */
  sessionId?: string
  /** 取消信号 */
  abortSignal?: AbortSignal
}

export interface RunAgentResult {
  /** 标准 Web ReadableStream<Uint8Array>，可直接作为 Response.body */
  stream: ReadableStream<Uint8Array>
}

export function runAgent(input: RunAgentInput): RunAgentResult {
  const sse = createSSEStream()

  // 派生一个内部 AbortController：把外部 abortSignal 转发给 orchestrator，
  // 避免直接把外部 signal 暴露给下游而失去局部控制能力（例如 orchestrator
  // 抛错时我们不需要再 abort、close 时也无需 abort）。
  const internalAbort = new AbortController()
  const externalSignal = input.abortSignal

  let abortHandler: (() => void) | null = null
  if (externalSignal) {
    if (externalSignal.aborted) {
      // 进入 runAgent 时已经 aborted：直接走 error 路径，仍然返回 stream
      // 让调用方按统一接口消费（流里只会有一个 error 事件 + [DONE]）。
      internalAbort.abort()
      sse.error('aborted')
      return { stream: sse.stream }
    }
    abortHandler = () => {
      internalAbort.abort()
      // 触发 sse.error('aborted')；createSSEStream 的 error 是幂等的，
      // 即便 orchestrator 紧接着 reject 也不会重复写帧。
      sse.error('aborted')
    }
    externalSignal.addEventListener('abort', abortHandler, { once: true })
  }

  // 在 microtask 中启动 orchestrator —— 立即把 stream 返回给调用方，
  // 不能 await。orchestrator 完成 → close；抛错 → error。
  // 用 Promise.resolve().then(...) 而不是直接调用，保证：
  //   1. orchestrator 抛同步异常时也走 .catch 收尾，不会冒泡
  //   2. 调用方拿到 stream 时事件循环还没开始消费 orchestrator
  Promise.resolve()
    .then(() =>
      runOrchestrator(
        {
          userId: input.userId,
          documentId: input.documentId,
          messages: input.messages,
          command: input.command,
          params: input.params,
          sessionId: input.sessionId,
          abortSignal: internalAbort.signal
        },
        sse
      )
    )
    .then(() => {
      // 正常结束：发 [DONE] 终止帧并关闭流（幂等，已 error 时为 no-op）
      sse.close()
    })
    .catch((err) => {
      // orchestrator 内部异常：写 error 事件 + [DONE] 后关流（幂等）
      sse.error(err)
    })
    .finally(() => {
      // 清理外部 signal 监听，避免内存泄漏（一次性监听其实也会自动移除，
      // 但显式 remove 能覆盖 once: true 不被 polyfill 实现的边界情况）
      if (externalSignal && abortHandler) {
        externalSignal.removeEventListener('abort', abortHandler)
      }
    })

  return { stream: sse.stream }
}

export type { SkillName, SkillManifest } from './types/skill'
export type { SSEEvent, SSEEventName } from './types/sse'
export type { ChunkHit } from './types/tool'
export type { SkillSession, SkillSessionState, SkillSessionStatus } from './types/session'
