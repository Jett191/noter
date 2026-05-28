import 'server-only'

/**
 * Noter Admin · Route Handler 响应辅助函数
 *
 * 设计参见 design.md §3、§Error Handling、§API Endpoints。
 *
 * 与 lib/http/handler.ts 协同:
 *   - handler.ts 通过 throw 错误类驱动错误响应(被 withRouteHandler 捕获)
 *   - response.ts 提供 Route Handler 内部主流程的便捷返回函数,与错误类风格一致
 *
 * 所有响应统一使用 application/json; charset=utf-8。
 */

import type { ErrorCode } from './handler'

/**
 * 内部 JSON Response 构造,统一头与字符集。
 */
function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  })
}

/**
 * 200 / 自定义状态成功响应。
 *
 * @example
 *   return success({ items, total })
 *   return success({ documentId }, 201)
 */
export function success<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return jsonResponse(data, status, headers)
}

/**
 * 204 No Content 响应,用于无返回体的成功场景(例如 DELETE)。
 */
export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers })
}

/**
 * 通用错误响应:status + 错误码 + 可选 message。
 * 优先抛出错误类(交给 handler 包装器统一处理);此函数用于不愿抛错的场景。
 */
export function error(
  code: ErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): Response {
  return jsonResponse({ error: code, message, ...(extra ?? {}) }, status)
}

/**
 * 401 unauthorized 响应,完全遵循 design.md 强约束:
 * { error: 'unauthorized', code: 'admin_auth_required' }
 *
 * 客户端 axios 拦截器据此跳转 /sign-in?reason=session_expired。
 */
export function unauthorized(): Response {
  return jsonResponse({ error: 'unauthorized', code: 'admin_auth_required' }, 401)
}
