import 'server-only'

/**
 * POST /api/admin/auth/sign-in
 *
 * 管理员登录接口。
 *
 * 设计参见 design.md §7.1 (管理员登录) 与 Requirements 1:
 *   1. IP 限流校验(10 次/10 分钟)
 *   2. Supabase Auth signInWithPassword
 *   3. 凭据无效 → 401
 *   4. 凭据通过 → 查 profiles 获取 role / not_active / deleted
 *   5. role='user' → signOut + 403「该账号无管理员权限」
 *   6. not_active=1 或 deleted=1 → signOut + 401
 *   7. role IN ('admin','super_admin') 且账号正常 → 200 + 用户信息
 *   8. Supabase Auth 超时(10s) → 504「服务暂时不可用」
 */

import { withRouteHandler, RateLimitError } from '@/lib/http/handler'
import { success, error } from '@/lib/http/response'
import { recordLoginAttempt } from '@/lib/auth/rateLimiter'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * 从请求中提取客户端 IP。
 * Next.js 在 Vercel 部署时通过 x-forwarded-for 传递真实 IP;
 * 本地开发时 fallback 到 x-real-ip 或 '127.0.0.1'。
 */
function extractIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP,取第一个(最接近客户端的)
    return forwarded.split(',')[0]!.trim()
  }
  return request.headers.get('x-real-ip') ?? '127.0.0.1'
}

async function handler(request: Request): Promise<Response> {
  // ─── 1. 解析请求体 ───
  let email: string
  let password: string
  try {
    const body = await request.json()
    email = body.email
    password = body.password
  } catch {
    return error('bad_request', '请求体格式错误', 400)
  }

  if (!email || !password) {
    return error('bad_request', '邮箱和密码不能为空', 400)
  }

  // ─── 2. IP 限流 ───
  const ip = extractIp(request)
  const rateResult = recordLoginAttempt(ip)
  if (!rateResult.allowed) {
    throw new RateLimitError('登录请求过于频繁，请稍后再试', rateResult.retryAfterSec)
  }

  // ─── 3. Supabase Auth signInWithPassword ───
  const supabase = await createSupabaseServerClient()
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError || !authData.user) {
    return error('unauthorized', '邮箱或密码错误', 401)
  }

  const user = authData.user

  // ─── 4. 使用 service_role 查询 profiles 获取角色与状态 ───
  const adminClient = getSupabaseAdmin()
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, not_active, deleted')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    // profiles 中找不到对应记录,异常情况,登出并拒绝
    await supabase.auth.signOut()
    return error('unauthorized', '账号信息异常', 401)
  }

  const { role, not_active, deleted } = profile as {
    role: string
    not_active: number
    deleted: number
  }

  // ─── 5. role='user' → 拒绝,不创建管理端会话 ───
  if (role === 'user') {
    await supabase.auth.signOut()
    return error('forbidden', '该账号无管理员权限', 403)
  }

  // ─── 6. 账号被封禁或已删除 → 拒绝 ───
  if (not_active === 1 || deleted === 1) {
    await supabase.auth.signOut()
    return error('unauthorized', '账号已被封禁或删除', 401)
  }

  // ─── 7. role IN ('admin','super_admin') 且账号正常 → 成功 ───
  if (role === 'admin' || role === 'super_admin') {
    return success({
      email: user.email,
      role
    })
  }

  // 兜底:未知角色,拒绝
  await supabase.auth.signOut()
  return error('unauthorized', '账号角色异常', 401)
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
