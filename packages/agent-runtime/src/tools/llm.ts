/**
 * LLMTool —— MiMo LLM (mimo-v2.5-pro) 调用封装。
 *
 * MiMo API 与 OpenAI Chat Completions 兼容：
 *   POST {MIMO_BASE_URL}/chat/completions
 *
 * 提供三种调用形态：
 * - stream(prompt, opts?)        → AsyncIterable<string>，每次 yield 一个 delta text 片段
 * - complete(prompt, opts?)      → Promise<string>，一次性返回完整文本
 * - completeJson(prompt, schema) → Promise<T>，启用 JSON 模式 + Zod 校验，
 *                                  失败自动重试一次，重试时把错误回喂提示让 LLM 修正
 *
 * 统一通过 AbortController 处理超时取消（默认 60s，可由调用方覆盖）。
 *
 * 假设说明：
 * - MIMO_BASE_URL 默认 `https://token-plan-sgp.xiaomimimo.com/v1`，与 supabase
 *   functions/generate-summary 保持一致；可通过环境变量覆盖（便于本地测试）
 * - 默认 model 为 `mimo-v2.5-pro`
 * - JSON 模式通过设置 `response_format: { type: 'json_object' }` + system 提示双保险
 *
 * Validates: Requirements 7.5, 7.14, 13.3, 13.4
 */

import type { ZodSchema } from 'zod'

// ---------------------------------------------------------------------------
// 常量与环境变量
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1'
const DEFAULT_MODEL = 'mimo-v2.5-pro'
const DEFAULT_TIMEOUT_MS = 60_000

function getApiKey(): string {
  const key = process.env.MIMO_API_KEY
  if (!key) {
    throw new LLMConfigError('MIMO_API_KEY is not set; cannot call MiMo LLM API')
  }
  return key
}

function getBaseUrl(): string {
  return (process.env.MIMO_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMRole = 'system' | 'user' | 'assistant'

export interface LLMMessage {
  role: LLMRole
  content: string
}

/** prompt 入参可以是单条 user 文本，或一组 messages */
export type LLMPrompt = string | LLMMessage[]

export interface LLMOptions {
  /** 覆盖默认 model，例如 `mimo-v2.5-pro` */
  model?: string
  /** 0-2，默认 0.3（与 supabase Edge Functions 现有调用约定一致） */
  temperature?: number
  /** 最大输出 token，默认不传由服务器决定 */
  maxTokens?: number
  /** 调用方传入的 abort 信号（如 SSE 客户端断开） */
  abortSignal?: AbortSignal
  /** 单次调用超时（毫秒），默认 60_000 */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMConfigError'
  }
}

export class LLMRequestError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LLMRequestError'
    this.status = status
  }
}

export class LLMTimeoutError extends Error {
  constructor(message = 'LLM request timed out') {
    super(message)
    this.name = 'LLMTimeoutError'
  }
}

export class LLMValidationError extends Error {
  /** 原始 LLM 输出（最后一次失败的） */
  rawOutput: string
  /** zod 解析失败原因摘要 */
  cause?: unknown
  constructor(message: string, rawOutput: string, cause?: unknown) {
    super(message)
    this.name = 'LLMValidationError'
    this.rawOutput = rawOutput
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 把 prompt 标准化为 messages[]；string → 单条 user message */
function normalizeMessages(prompt: LLMPrompt): LLMMessage[] {
  if (typeof prompt === 'string') {
    return [{ role: 'user', content: prompt }]
  }
  if (!Array.isArray(prompt) || prompt.length === 0) {
    throw new TypeError('LLM prompt must be a non-empty string or messages[]')
  }
  return prompt
}

/**
 * 把外部 abortSignal 与 timeoutMs 合并成单个 AbortSignal。
 * - 任一触发则下游 fetch 取消；超时触发时抛 LLMTimeoutError
 */
interface CombinedAbort {
  signal: AbortSignal
  /** 调用方在请求完成后必须调用 dispose 清理 timer / listener */
  dispose: () => void
  /** 超时触发标志（用于把 AbortError 区分成 LLMTimeoutError） */
  isTimedOut: () => boolean
}

function combineAbort(external: AbortSignal | undefined, timeoutMs: number): CombinedAbort {
  const ctrl = new AbortController()
  let timedOut = false

  const onExternalAbort = () => {
    ctrl.abort(external?.reason)
  }

  if (external) {
    if (external.aborted) {
      ctrl.abort(external.reason)
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort(new LLMTimeoutError(`LLM request exceeded ${timeoutMs}ms`))
  }, timeoutMs)
  // Node.js 下 setTimeout 返回的 Timeout 对象有 unref()；浏览器 / 测试环境可能没有
  const maybeNodeTimer = timer as unknown as { unref?: () => void }
  if (typeof maybeNodeTimer.unref === 'function') {
    maybeNodeTimer.unref()
  }

  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
    isTimedOut: () => timedOut
  }
}

/**
 * 从 LLM 文本输出中抽取首个完整 JSON：
 * - 优先匹配 ```json ... ``` 或 ``` ... ``` 代码块
 * - 否则匹配第一个 `{...}` 或 `[...]` 块
 * - 都未命中则原样 trim 返回（让 JSON.parse 报错）
 */
export function extractJsonString(content: string): string {
  const codeBlock = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlock) {
    return codeBlock[1].trim()
  }
  const objectMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (objectMatch) {
    return objectMatch[0]
  }
  return content.trim()
}

// ---------------------------------------------------------------------------
// 底层 HTTP 调用
// ---------------------------------------------------------------------------

interface ChatRequestBody {
  model: string
  messages: LLMMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  response_format?: { type: 'json_object' }
}

/** 包装 fetch 错误：取消 vs 超时 vs 其他 */
function rethrowFetchError(err: unknown, abort: CombinedAbort): never {
  if (abort.isTimedOut()) {
    throw new LLMTimeoutError()
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'DOMException')) {
    // 调用方主动取消
    throw err
  }
  if (err instanceof Error) {
    throw new LLMRequestError(`LLM fetch failed: ${err.message}`)
  }
  throw new LLMRequestError('LLM fetch failed: unknown error')
}

async function postChat(body: ChatRequestBody, signal: AbortSignal): Promise<Response> {
  const url = `${getBaseUrl()}/chat/completions`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`
    },
    body: JSON.stringify(body),
    signal
  })
}

// ---------------------------------------------------------------------------
// stream(prompt, opts?)
// ---------------------------------------------------------------------------

/**
 * 流式调用 MiMo LLM，返回 AsyncIterable<string>。
 * 每个 yield 为一段 delta text（可能跨多个 SSE chunk）。
 *
 * 实现细节：
 * - 设置 `stream: true`，OpenAI 兼容端点会以 SSE（`data: {...}\n\n`）流式返回
 * - 解析每行 `data: {json}`，跳过 `[DONE]` 与心跳空行
 * - 出错或调用方 abort 时抛错；超时抛 LLMTimeoutError
 */
export async function* stream(prompt: LLMPrompt, opts: LLMOptions = {}): AsyncIterable<string> {
  const messages = normalizeMessages(prompt)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const abort = combineAbort(opts.abortSignal, timeoutMs)

  const body: ChatRequestBody = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.3,
    stream: true,
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {})
  }

  let response: Response
  try {
    response = await postChat(body, abort.signal)
  } catch (err) {
    abort.dispose()
    rethrowFetchError(err, abort)
  }

  if (!response.ok) {
    abort.dispose()
    const errText = await safeReadText(response)
    throw new LLMRequestError(
      `MiMo LLM stream error (${response.status}): ${errText}`,
      response.status
    )
  }

  if (!response.body) {
    abort.dispose()
    throw new LLMRequestError('MiMo LLM stream response has no body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (err) {
        rethrowFetchError(err, abort)
      }
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })

      // SSE 事件以空行（\n\n）分隔
      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const delta = parseSSEEventDelta(rawEvent)
        if (delta === '__DONE__') return
        if (delta) yield delta
      }
    }
    // flush 最后一段（可能未以 \n\n 结束）
    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      const delta = parseSSEEventDelta(buffer)
      if (delta && delta !== '__DONE__') yield delta
    }
  } finally {
    abort.dispose()
    try {
      reader.releaseLock()
    } catch {
      // releaseLock 可能在 reader 已结束时抛错，忽略
    }
  }
}

/**
 * 把单个 SSE event（多行 `field: value`）解析为 delta text。
 * 返回：
 *   - 空字符串 → 心跳 / 无 content delta
 *   - '__DONE__' → 流结束
 *   - 其他 → delta 文本
 */
function parseSSEEventDelta(rawEvent: string): string {
  const lines = rawEvent.split('\n')
  let dataPayload = ''
  for (const line of lines) {
    if (line.startsWith('data:')) {
      // 多行 data: 拼接（OpenAI 兼容协议中通常单行，但稳妥起见）
      dataPayload += (dataPayload ? '\n' : '') + line.slice(5).trim()
    }
  }
  if (!dataPayload) return ''
  if (dataPayload === '[DONE]') return '__DONE__'
  try {
    const json = JSON.parse(dataPayload) as {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
      }>
    }
    const delta = json.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) return delta
    // 容错：部分实现把首包 / 尾包放在 message.content
    const fallback = json.choices?.[0]?.message?.content
    if (typeof fallback === 'string' && fallback.length > 0) return fallback
    return ''
  } catch {
    // 非 JSON（心跳 / 注释）忽略
    return ''
  }
}

// ---------------------------------------------------------------------------
// complete(prompt, opts?)
// ---------------------------------------------------------------------------

/**
 * 一次性返回完整文本。
 * 内部直接调非流式接口（更省解析开销 + 错误处理更直接）。
 */
export async function complete(prompt: LLMPrompt, opts: LLMOptions = {}): Promise<string> {
  return completeRaw(prompt, opts, /* jsonMode */ false)
}

/**
 * 内部：非流式调用，可选启用 JSON 模式。
 */
async function completeRaw(
  prompt: LLMPrompt,
  opts: LLMOptions,
  jsonMode: boolean
): Promise<string> {
  const messages = normalizeMessages(prompt)
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const abort = combineAbort(opts.abortSignal, timeoutMs)

  const body: ChatRequestBody = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  }

  try {
    const response = await postChat(body, abort.signal)
    if (!response.ok) {
      const errText = await safeReadText(response)
      throw new LLMRequestError(`MiMo LLM error (${response.status}): ${errText}`, response.status)
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new LLMRequestError('MiMo LLM returned no content')
    }
    return content
  } catch (err) {
    if (err instanceof LLMRequestError || err instanceof LLMTimeoutError) {
      throw err
    }
    rethrowFetchError(err, abort)
  } finally {
    abort.dispose()
  }
}

// ---------------------------------------------------------------------------
// completeJson(prompt, schema, opts?)
// ---------------------------------------------------------------------------

/**
 * 启用 JSON 模式（response_format: json_object）+ Zod schema 校验。
 *
 * 流程：
 * 1. 注入 system 提示约束「只输出 JSON、无 markdown 包裹」
 * 2. 调一次 LLM，提取首个 JSON 子串，zod parse
 * 3. 失败则把错误回喂给 LLM 让其修正，重试一次
 * 4. 仍失败抛 LLMValidationError
 *
 * 重试时使用同一 timeoutMs / abortSignal —— 时间预算由调用方在 opts.timeoutMs 中
 * 整体安排（例如 /quiz 出题 45s 整段限制）。两次串联调用都受同一 timeout 控制。
 */
export async function completeJson<T>(
  prompt: LLMPrompt,
  schema: ZodSchema<T>,
  opts: LLMOptions = {}
): Promise<T> {
  const baseMessages = normalizeMessages(prompt)
  const jsonSystemHint: LLMMessage = {
    role: 'system',
    content:
      "You MUST respond with a single valid JSON value that satisfies the user's schema requirements. Do not wrap it in markdown code fences. Do not add any explanatory prose before or after the JSON."
  }
  const messages: LLMMessage[] =
    baseMessages[0]?.role === 'system'
      ? [
          { role: 'system', content: `${baseMessages[0].content}\n\n${jsonSystemHint.content}` },
          ...baseMessages.slice(1)
        ]
      : [jsonSystemHint, ...baseMessages]

  // ---- 第一次尝试 ----
  const firstRaw = await completeRaw(messages, opts, /* jsonMode */ true)
  const firstResult = tryParseJson(firstRaw, schema)
  if (firstResult.ok) return firstResult.value

  // ---- 重试一次：把错误回喂 ----
  const correctionMessages: LLMMessage[] = [
    ...messages,
    { role: 'assistant', content: firstRaw },
    {
      role: 'user',
      content:
        'Your previous response was not valid JSON or did not satisfy the required schema. ' +
        `Validation error: ${firstResult.error}\n` +
        'Please respond again with ONLY a corrected JSON value, no markdown, no commentary.'
    }
  ]
  const secondRaw = await completeRaw(correctionMessages, opts, /* jsonMode */ true)
  const secondResult = tryParseJson(secondRaw, schema)
  if (secondResult.ok) return secondResult.value

  throw new LLMValidationError(
    `LLM JSON output failed schema validation after one retry: ${secondResult.error}`,
    secondRaw,
    secondResult.cause
  )
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string; cause?: unknown }

function tryParseJson<T>(raw: string, schema: ZodSchema<T>): ParseResult<T> {
  const jsonStr = extractJsonString(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `JSON.parse failed: ${msg}`, cause: err }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; '),
      cause: result.error
    }
  }
  return { ok: true, value: result.data }
}

// ---------------------------------------------------------------------------
// 杂项
// ---------------------------------------------------------------------------

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return '<failed to read error body>'
  }
}
