import 'server-only'

/**
 * POST /api/admin/auth/sign-out
 *
 * 管理员登出接口。
 *
 * 设计参见 design.md §3 (鉴权链):
 *   1. 校验当前 session(graceful:session 已失效仍返回 200)
 *   2. 调用 Supabase Auth signOut 使 session 失效
 *   3. 清除 cookie session
 *   4. 返回 200
 */

import { withRouteHandler } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { createSupabaseServerClient } from '@/lib/supabase/server'

async function handler(): Promise<Response> {
  const supabase = await createSupabaseServerClient()

  // Graceful handling: 即使 session 已失效,signOut 也不会报错,
  // 它会清除服务端 cookie 中的 session token。
  // 我们不调用 requireAdmin,因为即使 session 无效也应允许登出。
  await supabase.auth.signOut()

  return success({ message: '登出成功' })
}

export const POST = withRouteHandler(handler)
