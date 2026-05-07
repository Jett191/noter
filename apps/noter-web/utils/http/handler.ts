import { ZodError } from 'zod'
import { error } from './response'

export function handler(handler: (request: Request) => Promise<Response>) {
  return async function (request: Request) {
    try {
      return await handler(request)
    } catch (err) {
      if (err instanceof ZodError) {
        return error(err.issues[0]?.message || '参数错误', 400)
      }

      if (err instanceof SyntaxError) {
        return error('请求体不是合法 JSON', 400)
      }

      if (err instanceof Error) {
        return error(err.message || '服务器错误', 500)
      }

      return error('服务器错误', 500)
    }
  }
}
