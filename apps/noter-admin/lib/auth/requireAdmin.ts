import 'server-only'

/**
 * Noter Admin · 共享鉴权守卫
 *
 * 设计参见 design.md §Architecture (鉴权链) 与 Requirements 2:
 *   - 所有受保护的 /api/admin/* Route Handler 首行调用 requireAdmin(request)
 *   - 校验流程:
 *       1. 通过 @supabase/ssr cookie session 客户端获取当前用户
 *       2. 使用 service_role 客户端查询 profiles 表获取 role / not_active / deleted
 *       3. 校验 role IN ('admin','super_admin') AND not_active=0 AND deleted=0
 *   - 校验通过返回 AdminContext { userId, email, role }
 *   - 校验失败抛 UnauthorizedError,由 withRouteHandler 捕获返回 401
 *     { error:'unauthorized', code:'admin_auth_required' }
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { UnauthorizedError } from '@/lib/http/handler'

export interface AdminContext {
  userId: string
  email: string
  role: 'admin' | 'super_admin'
}

/**
 * 校验当前请求的 cookie session 并验证管理员身份。
 *
 * @throws UnauthorizedError 当以下任一条件成立时:
 *   - 无有效 cookie session
 *   - session 对应用户在 profiles 中不存在
 *   - role 不是 'admin' 或 'super_admin'
 *   - 账号被封禁 (not_active=1)
 *   - 账号被软删除 (deleted=1)
 */
export async function requireAdmin(): Promise<AdminContext> {
  // 1. 通过 cookie session 获取当前用户
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  // 2. 使用 service_role 客户端查询 profiles(绕过 RLS)
  const adminClient = getSupabaseAdmin()
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, not_active, deleted')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new UnauthorizedError()
  }

  // 3. 校验角色与账号状态
  const { role, not_active, deleted } = profile as {
    role: string
    not_active: number
    deleted: number
  }

  if ((role !== 'admin' && role !== 'super_admin') || not_active !== 0 || deleted !== 0) {
    throw new UnauthorizedError()
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    role: role as 'admin' | 'super_admin'
  }
}
