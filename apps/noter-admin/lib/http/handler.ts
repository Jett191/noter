import 'server-only'

/**
 * Noter Admin · Route Handler 包装器
 *
 * 设计参见 design.md §3 (Architecture) 与 §Error Handling:
 *   - 所有 /api/admin/* Route Handler 用 withRouteHandler() 包装,统一处理:
 *       1. 自定义错误类 → 固定 HTTP 状态 + 标准 JSON 响应
 *       2. 可选超时:Promise.race 模式,超时返回 504
 *       3. 兜底捕获非预期异常 → 500,日志已脱敏(不输出请求 body / 头信息)
 *   - 错误类作为本模块的命名导出,Route Handler 通过 throw new XxxError(...) 触发响应
 *   - 401 严格遵循 design.md:{ error: 'unauthorized', code: 'admin_auth_required' }
 */

// ===== 错误类型 =====
// 所有错误类都设置 name,以便 instanceof 在多次模块加载下仍可识别(尤其是 ESM HMR 场景)。

export class UnauthorizedError extends Error {
  constructor(message = 'admin_auth_required') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'not_found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor(message = 'conflict') {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ValidationError extends Error {
  details?: unknown
  constructor(message = 'bad_request', details?: unknown) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class RateLimitError extends Error {
  retryAfterSec?: number
  constructor(message = 'rate_limited', retryAfterSec?: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSec = retryAfterSec
  }
}

export class TimeoutError extends Error {
  constructor(message = 'request_timeout') {
    super(message)
    this.name = 'TimeoutError'
  }
}

// ===== 错误码联合类型 =====
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'bad_request'
  | 'rate_limited'
  | 'timeout'
  | 'internal_error'

// ===== Route Handler 类型 =====
type RouteHandlerCtx = unknown
export type RouteHandler = (request: Request, ctx?: RouteHandlerCtx) => Promise<Response>

export interface WithRouteHandlerOptions {
  /** 默认 10 秒,边界值参见 design.md §6:列表/详情 10s,编辑/版本 15s,批量上传 60s */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

// ===== 内部工具:统一 JSON 响应构造 =====
function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  })
}

// ===== 错误 → 响应 转换 =====
function errorToResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError) {
    // design.md 强约束:401 统一 { error:'unauthorized', code:'admin_auth_required' }
    return jsonResponse({ error: 'unauthorized', code: 'admin_auth_required' }, 401)
  }
  if (err instanceof ForbiddenError) {
    return jsonResponse({ error: 'forbidden', message: err.message }, 403)
  }
  if (err instanceof NotFoundError) {
    return jsonResponse({ error: 'not_found', message: err.message }, 404)
  }
  if (err instanceof ConflictError) {
    return jsonResponse({ error: 'conflict', message: err.message }, 409)
  }
  if (err instanceof ValidationError) {
    const body: Record<string, unknown> = {
      error: 'bad_request',
      message: err.message
    }
    if (err.details !== undefined) body.details = err.details
    return jsonResponse(body, 400)
  }
  if (err instanceof RateLimitError) {
    const headers: Record<string, string> = {}
    if (err.retryAfterSec && err.retryAfterSec > 0) {
      headers['Retry-After'] = String(err.retryAfterSec)
    }
    return jsonResponse({ error: 'rate_limited', message: err.message }, 429, headers)
  }
  if (err instanceof TimeoutError) {
    return jsonResponse({ error: 'timeout', message: 'request_timeout' }, 504)
  }
  // 兜底:不暴露内部错误细节,仅服务端日志
  return jsonResponse({ error: 'internal_error', message: 'internal_server_error' }, 500)
}

/**
 * 包装一个 Route Handler,提供:
 *   - 统一的异常 → JSON 响应映射
 *   - 可配置超时(默认 10s,使用 Promise.race + AbortController-friendly 模式)
 *   - 服务端日志脱敏:仅输出错误名 / message / 路径 / 方法,不输出 body / 头
 */
export function withRouteHandler(
  handler: RouteHandler,
  options: WithRouteHandlerOptions = {}
): RouteHandler {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return async (request: Request, ctx?: RouteHandlerCtx): Promise<Response> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const handlerPromise = handler(request, ctx)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new TimeoutError())
        }, timeoutMs)
      })
      const response = await Promise.race([handlerPromise, timeoutPromise])
      return response
    } catch (err) {
      // 服务端日志:仅输出已脱敏的元信息
      const url = (() => {
        try {
          return new URL(request.url).pathname
        } catch {
          return 'unknown'
        }
      })()
      const errName = err instanceof Error ? err.name : typeof err
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(
        `[noter-admin] Route handler error: method=${request.method} path=${url} name=${errName} message=${errMsg}`
      )
      return errorToResponse(err)
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
    }
  }
}
