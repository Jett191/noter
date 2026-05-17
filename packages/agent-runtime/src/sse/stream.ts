/**
 * SSE 流式响应封装。
 *
 * 提供 `createSSEStream()` 返回 `{ stream, send, close, error }`：
 *
 * - `stream` 是 Web 标准 `ReadableStream<Uint8Array>`，可直接作为
 *   Next.js Route Handler `Response.body`。
 * - `send(event)` 序列化为 `data: {json}\n\n` UTF-8 字节写入流。
 * - `close()` 输出终止帧 `data: [DONE]\n\n` 后关闭流。
 * - `error(err)` 输出 `event=error` 事件 + 终止帧后关闭流。
 *
 * 关键约束（与 design.md / requirements 10.x 一致）：
 *
 * 1. **行结束符** 一律 `\n\n`；UTF-8 编码统一走 `TextEncoder`。
 * 2. **并发 send 串行写入**：所有写操作经一条 Promise 链
 *    （`writeQueue`）排队，避免 enqueue race；
 *    Web `ReadableStreamDefaultController.enqueue` 本身是同步的，
 *    但我们仍把写入语义统一为「按 send 调用顺序」。
 * 3. **close 后 send 为 no-op**：避免后续误用抛错破坏已结束的流；
 *    error 也具备同样幂等性（多次调用只输出第一次）。
 * 4. 终止帧 `data: [DONE]\n\n` **不是** SSE event，不计入事件清单。
 */

import type { SSEEvent } from '../types/sse'

export interface SSEStreamHandle {
  stream: ReadableStream<Uint8Array>
  /** 写入一个 SSE 事件；流已关闭时为 no-op。 */
  send(event: SSEEvent): void
  /** 输出 `[DONE]` 终止帧后关闭流；幂等。 */
  close(): void
  /** 输出 error 事件 + 终止帧后关闭流；幂等。 */
  error(err: unknown): void
}

const DONE_FRAME = 'data: [DONE]\n\n'

function serializeEvent(event: SSEEvent): string {
  // 扁平字段写法：`{"event":"content","content":"..."}`
  // JSON.stringify 自动 escape 换行，避免破坏 SSE `\n\n` 分隔符。
  return `data: ${JSON.stringify(event)}\n\n`
}

function normalizeError(err: unknown): { error: string; code?: number } {
  if (err instanceof Error) {
    return { error: err.message || 'internal error' }
  }
  if (typeof err === 'string') {
    return { error: err }
  }
  if (err && typeof err === 'object') {
    const maybe = err as { error?: unknown; message?: unknown; code?: unknown }
    const msg =
      typeof maybe.error === 'string'
        ? maybe.error
        : typeof maybe.message === 'string'
          ? maybe.message
          : 'internal error'
    const code = typeof maybe.code === 'number' ? maybe.code : undefined
    return code !== undefined ? { error: msg, code } : { error: msg }
  }
  return { error: 'internal error' }
}

export function createSSEStream(): SSEStreamHandle {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false
  // 串行化所有写入：每次 send/close/error 都把工作 push 到这条 Promise 链尾。
  // controller.enqueue 本身同步，但用队列保证调用顺序确定且未来可换异步背压。
  let writeQueue: Promise<void> = Promise.resolve()

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      // 下游（客户端）主动断开：标记 closed 让后续 send 静默丢弃。
      closed = true
      controller = null
    }
  })

  function enqueueRaw(text: string): void {
    if (closed || !controller) return
    try {
      controller.enqueue(encoder.encode(text))
    } catch {
      // 流已被外部关闭/cancel：静默吞掉，标记为 closed。
      closed = true
      controller = null
    }
  }

  function closeController(): void {
    if (closed || !controller) {
      closed = true
      controller = null
      return
    }
    try {
      controller.close()
    } catch {
      // ignore — 已经关过
    }
    closed = true
    controller = null
  }

  const handle: SSEStreamHandle = {
    stream,
    send(event) {
      if (closed) return
      writeQueue = writeQueue.then(() => {
        if (closed) return
        enqueueRaw(serializeEvent(event))
      })
    },
    close() {
      if (closed) return
      writeQueue = writeQueue.then(() => {
        if (closed) return
        enqueueRaw(DONE_FRAME)
        closeController()
      })
    },
    error(err) {
      if (closed) return
      const payload = normalizeError(err)
      writeQueue = writeQueue.then(() => {
        if (closed) return
        enqueueRaw(serializeEvent({ event: 'error', ...payload }))
        enqueueRaw(DONE_FRAME)
        closeController()
      })
    }
  }

  return handle
}
