'use client'

/**
 * `useChatStream` —— 文档详情 chat panel 的 SSE 客户端 Hook（Task 11.1）。
 *
 * 设计背景见 `.kiro/specs/noter-agent/design.md`「SSE 协议」与
 * `.kiro/specs/noter-agent/requirements.md` 需求 7 / 10。Hook 是一个**薄**的
 * 流式客户端：调用 `/api/ai/chat/stream`，把 5 类 SSE 事件按以下契约分发到
 * `chatSession` store；其余业务（消息渲染、Launchpad 显隐、SkillRouter）由调
 * 用方与 store 内部各司其职。
 *
 * 事件分发契约（与 design.md 「事件清单」一致）：
 *   - `content` → 累积到 messageList 末尾的 assistant 文本消息；末尾不是
 *     assistant 文本时新建一条
 *   - `structured_message` → `appendMessage` 一条带 `messageType` / `payload`
 *     的新消息（成为新的「末尾 assistant」，让后续 follow_ups 绑定到它）
 *   - `follow_ups` → 将 `chips` 写入末尾 assistant 消息的 `followUps` 字段
 *   - `session_banner` → 直接转发给 `chatSession.applySessionBanner`；后者
 *     会在 payload 含 `sessionId`（仅 `/quiz` configuring 阶段首次推送）时把
 *     sessionId 持久化到 store，供后续 answering / graded 续签使用
 *   - `error` → `state = 'error'`，并 `appendMessage` 一条 assistant 文本消息
 *     展示错误（流随后由后端关闭，前端正常退出读取循环）
 *
 * sessionId 解析顺序（满足「后续提交从 store 读取 sessionId 续签」）：
 *   1. `payload.sessionId`（caller 显式覆盖）
 *   2. Hook options.sessionId（构造时显式注入）
 *   3. `chatSessionStore.getState().activeSession?.id`（自动续签默认值）
 *
 * 状态机：`idle → streaming → idle | error`。
 *   - 主动 `abort()`：取消 fetch；状态回到 `'idle'`，不写错误消息
 *   - 收到 `error` 事件：状态置 `'error'`，追加错误消息
 *   - 网络抛错（非 abort）：状态置 `'error'`，追加错误消息
 *   - 正常 `[DONE]`：状态回到 `'idle'`
 *
 * 设计取舍：
 *   • Hook 不主动 append 用户消息——caller 在 sendMessage 之前自行决定如何
 *     展示 user message，避免 Hook 同时承担「消息编辑」语义。
 *   • content 事件不依赖「caller 提前放置一个空 assistant placeholder」的
 *     约定：首次 content 到达时若末尾不是 assistant 文本，自动新建一条；
 *     这样 BriefCard 等「只发结构化消息」的 Skill 也不会留下空 placeholder。
 *   • 通过 `useChatSessionStore.setState` 直接 mutate 是为了把「在末尾消息上
 *     原地累积 content」「附加 followUps」这种细颗粒度更新放在 Hook 内，避免
 *     污染 store API（store API 只暴露语义操作，不暴露 mutation 工具）。
 *
 * Validates: Requirements 7.2, 10.1, 10.2, 10.5, 10.8
 */

import { useCallback, useRef, useState } from 'react'

import { useChatSessionStore, type SessionBannerPayload } from '@/stores/chatSession'
import type {
  ChatMessage,
  FollowUpChip,
  SkillName,
  SSEEvent,
  StructuredMessageType
} from '@/types/agent'

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

/** Hook 暴露的状态机取值。`'streaming'` 期间禁止重入 sendMessage。 */
export type ChatStreamState = 'idle' | 'streaming' | 'error'

/** sendMessage 入参 —— 与 `/api/ai/chat/stream` 请求体同构，Hook 负责注入
 *  documentId 与 sessionId 默认值。 */
export interface SendMessagePayload {
  /** 完整的对话历史（user + assistant 拼接），由 caller 维护 */
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** 显式触发的 Skill 命令（如 /brief、/tutor）；与自然语言路径互斥 */
  command?: SkillName
  /** Skill 透传参数（/explain 的 concept、/quiz 的 config / answers 等） */
  params?: Record<string, unknown>
  /** 显式覆盖 sessionId；缺省时按上述「解析顺序」回落 */
  sessionId?: string
}

export interface UseChatStreamOptions {
  documentId: string
  /** 构造时注入的默认 sessionId；优先级低于 sendMessage 显式入参，高于 store。 */
  sessionId?: string
}

export interface UseChatStreamReturn {
  sendMessage: (payload: SendMessagePayload) => Promise<void>
  /** 中断当前流式请求。无活跃请求时为 no-op。 */
  abort: () => void
  /** 当前状态机；React 状态，订阅 Hook 的组件会随之 re-render */
  state: ChatStreamState
}

// ---------------------------------------------------------------------------
// 实现常量
// ---------------------------------------------------------------------------

const SSE_ENDPOINT = '/api/ai/chat/stream'
/** 网络抛错时展示的兜底文案（中文，与现有 AIChatPanel 风格一致） */
const FALLBACK_NETWORK_MESSAGE = '抱歉，网络连接出现问题，请稍后重试。'
/** 服务端 error 事件无 message 时的兜底文案 */
const FALLBACK_SERVER_ERROR_MESSAGE = '请求失败，请稍后重试。'

// ---------------------------------------------------------------------------
// Hook 主体
// ---------------------------------------------------------------------------

export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const { documentId } = options
  const optionSessionId = options.sessionId

  const [state, setState] = useState<ChatStreamState>('idle')

  /** 当前活跃请求的 AbortController；空闲时为 null。 */
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    const controller = abortControllerRef.current
    if (controller) {
      controller.abort()
      abortControllerRef.current = null
    }
  }, [])

  const sendMessage = useCallback(
    async (payload: SendMessagePayload): Promise<void> => {
      // —— 防重入：上一条流仍在跑 → 先 abort，避免两路 SSE 同时写 store ——
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      // —— 解析 sessionId：显式入参 > Hook options > store.activeSession.id ——
      // store 读取一律走 getState() 而不是 useStore() —— 这是 callback 内的
      // 一次性读取，不需要订阅；同时避免 useEffect 依赖列表抖动。
      const fallbackSessionId = useChatSessionStore.getState().activeSession?.id
      const sessionId = payload.sessionId ?? optionSessionId ?? fallbackSessionId

      const controller = new AbortController()
      abortControllerRef.current = controller

      setState('streaming')

      try {
        const response = await fetch(SSE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            documentId,
            messages: payload.messages,
            command: payload.command,
            params: payload.params,
            sessionId
          })
        })

        if (!response.ok) {
          // Route Handler 在校验失败时返回 JSON `{ error }`；尝试读出来作为
          // 错误消息追加到对话流。读不出来时走兜底文案。
          let errorText = FALLBACK_SERVER_ERROR_MESSAGE
          try {
            const data = (await response.json()) as { error?: unknown }
            if (typeof data.error === 'string' && data.error.length > 0) {
              errorText = data.error
            }
          } catch {
            // ignore — 解析失败走兜底
          }
          appendErrorMessage(errorText)
          setState('error')
          return
        }

        if (!response.body) {
          appendErrorMessage(FALLBACK_NETWORK_MESSAGE)
          setState('error')
          return
        }

        const result = await pumpSSE(response.body, controller.signal)

        // pumpSSE 返回流是否以服务端 error 事件结束（true → 状态置 error，
        // false → 状态置 idle）。abort 路径不会进到这里（throws）。
        setState(result.endedWithError ? 'error' : 'idle')
      } catch (err) {
        if (isAbortError(err)) {
          // 主动 abort：保留已写入的部分回复，不追加错误消息；状态回 idle。
          setState('idle')
        } else {
          appendErrorMessage(FALLBACK_NETWORK_MESSAGE)
          setState('error')
        }
      } finally {
        // 只有当当前 controller 仍然是 ref 中的那一个时才清空：避免在 abort()
        // 之后立即调用 sendMessage 时把新的 controller 误清掉。
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        // 流结束时如果末尾仍带 isLoading：空占位删掉、有内容则关掉 isLoading（让 BlinkingCaret 消失）
        finalizeTrailingLoading()
      }
    },
    [documentId, optionSessionId]
  )

  return { sendMessage, abort, state }
}

// ===========================================================================
// SSE 解析
// ===========================================================================

/**
 * 从 ReadableStream 拉取 SSE 帧并分发事件。
 *
 * SSE 协议：每个事件由空行（`\n\n`）分隔，事件内可有多条 `data:` 行（按
 * 协议拼接为单条 message）。Noter Agent 当前每个事件实际只有一条
 * `data: {json}` 行；但实现上仍按标准做多行拼接，避免未来扩展时回归。
 *
 * 终止条件（按出现顺序优先级）：
 *   1. `data: [DONE]` —— 正常终止帧（Requirements 10.8）
 *   2. 服务端 error 事件已写入流后 createSSEStream 会自动 close → ReadableStream
 *      自然结束，本函数返回 `endedWithError = true`
 *   3. ReadableStream 自然结束（`reader.read()` 返回 `done: true`）
 *
 * 返回 `{ endedWithError }`：caller 据此置 state = 'error' 或 'idle'。
 */
async function pumpSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): Promise<{ endedWithError: boolean }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let endedWithError = false

  try {
    while (true) {
      if (signal.aborted) {
        // 主动 abort：直接抛 AbortError，由调用方 catch 后转 idle。reader.cancel
        // 让上游知道 client 不再消费，触发 createSSEStream 的 cancel 逻辑。
        await reader.cancel().catch(() => {})
        throw new DOMException('Aborted', 'AbortError')
      }

      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 按事件边界（空行 `\n\n`）切分；最后一段可能不完整，留在 buffer 中。
      // 同时兼容 `\r\n\r\n`（少见的代理改写场景）。
      let separatorIndex = findEventSeparator(buffer)
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex.start)
        buffer = buffer.slice(separatorIndex.end)
        const result = handleRawEvent(rawEvent)
        if (result === 'done') {
          await reader.cancel().catch(() => {})
          return { endedWithError }
        }
        if (result === 'error') {
          endedWithError = true
          // 不立即 return：服务端 createSSEStream.error 会紧接着写
          // `[DONE]`；继续读取直到流自然结束更稳健。
        }
        separatorIndex = findEventSeparator(buffer)
      }
    }

    // 流自然结束（无 [DONE] 帧也兼容）：把剩余 buffer 作为最后一帧尝试解析。
    const trailing = buffer.trim()
    if (trailing.length > 0) {
      const result = handleRawEvent(trailing)
      if (result === 'error') endedWithError = true
    }

    return { endedWithError }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // reader 可能已经因 cancel 被释放；忽略
    }
  }
}

interface SeparatorMatch {
  /** 事件结束位置（即 separator 起点） */
  start: number
  /** 下一个事件起点（即 separator 终点） */
  end: number
}

/** 查找下一个 SSE 事件分隔符（`\n\n` 或 `\r\n\r\n`），返回切分位置。 */
function findEventSeparator(buffer: string): SeparatorMatch | -1 {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')
  // 选先出现的；都没有则返回 -1
  if (lf === -1 && crlf === -1) return -1
  if (lf === -1) return { start: crlf, end: crlf + 4 }
  if (crlf === -1) return { start: lf, end: lf + 2 }
  return lf < crlf ? { start: lf, end: lf + 2 } : { start: crlf, end: crlf + 4 }
}

/**
 * 处理一段已切分好的 SSE 事件原文（不含分隔符）。
 *
 * 返回值：
 *   - `'done'`：遇到 `[DONE]` 终止帧，调用方应停止读取
 *   - `'error'`：成功解析为 error 事件
 *   - `null`：其他事件（已分发到 store）或无效帧（已忽略）
 */
function handleRawEvent(rawEvent: string): 'done' | 'error' | null {
  // 协议规定每个事件一行 `data: {json}`，但允许多行 data 拼接；
  // 同时容忍 `\r\n` 行尾与无空格的 `data:`。
  const lines = rawEvent.split(/\r?\n/)
  let dataPayload = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      // 标准格式 `data: payload`，第一个空格可选
      dataPayload += line.slice(line.startsWith('data: ') ? 6 : 5)
    }
    // 其他字段（event:、id:、retry:）当前协议不使用，忽略
  }

  const trimmed = dataPayload.trim()
  if (trimmed.length === 0) return null

  // 终止帧 `[DONE]` —— Requirements 10.8
  if (trimmed === '[DONE]') return 'done'

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // 协议外的脏数据：忽略，避免单个坏帧把整条流毙了
    return null
  }

  if (!isSSEEvent(parsed)) {
    return null
  }

  return dispatchSSEEvent(parsed)
}

/** 类型守卫：只接受 design.md 事件清单内 5 类事件 */
function isSSEEvent(value: unknown): value is SSEEvent {
  if (!value || typeof value !== 'object') return false
  const event = (value as { event?: unknown }).event
  return (
    event === 'content' ||
    event === 'structured_message' ||
    event === 'follow_ups' ||
    event === 'session_banner' ||
    event === 'error'
  )
}

/**
 * 把已校验的 SSE 事件分发到 chatSession store。
 *
 * 返回 `'error'` 当事件类型为 error（caller 据此把状态置 'error'）；其他事件
 * 返回 `null`。
 */
function dispatchSSEEvent(event: SSEEvent): 'error' | null {
  switch (event.event) {
    case 'content':
      appendContentChunk(event.content)
      return null

    case 'structured_message':
      appendStructuredMessage(event.messageType, event.payload)
      return null

    case 'follow_ups':
      attachFollowUps(event.chips)
      return null

    case 'session_banner':
      // 直接交给 store——store 内部会区分 active / ended / interrupted，并在
      // payload 含 sessionId（/quiz configuring 首次）时记录用于后续续签。
      useChatSessionStore.getState().applySessionBanner(event satisfies SessionBannerPayload)
      return null

    case 'error': {
      const text = event.error || FALLBACK_SERVER_ERROR_MESSAGE
      appendErrorMessage(text)
      return 'error'
    }
  }
}

// ===========================================================================
// store 写入辅助：累积 content / 追加 structured / 绑定 followUps
// ===========================================================================

/**
 * 把一段 content 累积到 messageList 末尾的 assistant 文本消息。
 *
 * - 末尾是 assistant 文本（无 messageType）→ 拼接到 content 字段
 * - 末尾不是（user 消息 / 结构化消息 / 列表为空）→ 新建一条 assistant 文本消息
 *
 * 用 `setState((s) => ...)` 一次性原子更新，避免 React 18 严格模式下的
 * 双重渲染导致重复拼接。
 */
function appendContentChunk(content: string): void {
  if (!content) return
  useChatSessionStore.setState((s) => {
    const list = s.messageList
    const last = list[list.length - 1]
    if (last && last.role === 'assistant' && !last.messageType) {
      const merged: ChatMessage = {
        ...last,
        // 末尾若是 isLoading 占位（content=''），首次 content 到达时升级为正文。
        // **保留 isLoading=true** 让 ChatMessage 在末尾追加 BlinkingCaret 提示流式仍在进行；
        // 流结束（pumpSSE 完成 / [DONE] / 错误 / abort）时由 finalizeTrailingLoading 关掉。
        content: last.content + content
      }
      return {
        messageList: [...list.slice(0, -1), merged],
        // 与 store.appendMessage 行为对齐：任何消息变更都意味着 Launchpad 隐藏
        launchpadVisible: false
      }
    }
    // 新建 assistant 文本消息（流首帧未先经过 typing 占位的边缘情况）
    const created: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      content,
      createdAt: Date.now(),
      isLoading: true
    }
    return {
      messageList: [...list, created],
      launchpadVisible: false
    }
  })
}

/** 新增一条结构化消息（BriefCard / TutorTurnCard / ... / QuizResultCard）。 */
function appendStructuredMessage(messageType: StructuredMessageType, payload: unknown): void {
  // 若末尾是 isLoading 占位（command 路径预先插入的 typing 气泡），先把它丢掉，
  // 让结构化卡片直接顶替；避免「typing 气泡 + 卡片」两条同时出现。
  useChatSessionStore.setState((s) => {
    const list = s.messageList
    const last = list[list.length - 1]
    const trimmedList =
      last && last.role === 'assistant' && last.isLoading && !last.messageType
        ? list.slice(0, -1)
        : list
    const created: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
      messageType,
      payload,
      createdAt: Date.now()
    }
    return {
      messageList: [...trimmedList, created],
      launchpadVisible: false
    }
  })
}

/**
 * 把 follow_ups chips 绑定到末尾 assistant 消息（无论文本还是结构化）。
 *
 * 末尾不是 assistant 时静默忽略——按 design.md 规范 follow_ups 总在 BriefCard /
 * ExplainCard / ActionsCard 之后到达，理论上不会出现这种情况。但仍做防御性处理
 * 避免协议异常时整条流崩溃。
 */
function attachFollowUps(chips: FollowUpChip[]): void {
  if (!chips || chips.length === 0) return
  useChatSessionStore.setState((s) => {
    const list = s.messageList
    const last = list[list.length - 1]
    if (!last || last.role !== 'assistant') return s
    const merged: ChatMessage = { ...last, followUps: chips }
    return { messageList: [...list.slice(0, -1), merged] }
  })
}

/** 追加一条 assistant 文本错误消息（与 fallback 路径共用）。 */
function appendErrorMessage(text: string): void {
  // 错误消息也要替换掉末尾的 isLoading 占位，避免「typing 气泡 + 错误气泡」并存
  useChatSessionStore.setState((s) => {
    const list = s.messageList
    const last = list[list.length - 1]
    const trimmed =
      last && last.role === 'assistant' && last.isLoading && !last.messageType
        ? list.slice(0, -1)
        : list
    const created: ChatMessage = {
      id: createMessageId(),
      role: 'assistant',
      content: text,
      createdAt: Date.now()
    }
    return { messageList: [...trimmed, created], launchpadVisible: false }
  })
}

/**
 * 流式收尾：处理末尾 assistant 消息的 isLoading 状态：
 *   - 末尾是空占位（isLoading=true 且 content='') → 直接从列表移除（无内容，避免悬空 typing 动画）
 *   - 末尾是流式正文（isLoading=true 且 content 非空） → 关掉 isLoading（让 BlinkingCaret 消失）
 *   - 其他情况不动
 */
function finalizeTrailingLoading(): void {
  useChatSessionStore.setState((s) => {
    const list = s.messageList
    const last = list[list.length - 1]
    if (!last || last.role !== 'assistant' || last.messageType || !last.isLoading) {
      return s
    }
    if (last.content.length === 0) {
      return { messageList: list.slice(0, -1) }
    }
    const merged: ChatMessage = { ...last, isLoading: false }
    return { messageList: [...list.slice(0, -1), merged] }
  })
}

// ===========================================================================
// 工具函数
// ===========================================================================

/**
 * 生成消息 id。优先 `crypto.randomUUID`；不可用时回退到时间戳 + 随机串以
 * 兼容 SSR / 老浏览器。前端 React key 只需唯一，强度无要求。
 */
function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 判定一个错误是否来自 AbortController（fetch / DOMException 双形态）。 */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err && typeof err === 'object' && 'name' in err) {
    return (err as { name?: unknown }).name === 'AbortError'
  }
  return false
}
