import 'server-only'

/**
 * GET /api/admin/users/[id]
 *
 * 用户详情接口:返回用户基本信息 + 私有文档统计。
 *
 * 设计参见 design.md §6.1 (用户管理):
 *   - 受 requireAdmin() 保护
 *   - 使用 service_role 客户端查询 profiles 表
 *   - 过滤 is_system_account=false(系统账号返回 404)
 *   - 返回字段:id, email, username, role, not_active, deleted, created_at, updated_at
 *   - 附加私有文档统计:documents WHERE user_id=target AND document_scope='private'
 *   - 用户不存在或为系统账号 → 404
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(_request: Request, ctx: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 获取路径参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id } = await params

  // ─── 3. 查询用户 ───
  const adminClient = getSupabaseAdmin()
  const { data: user, error: userError } = await adminClient
    .from('profiles')
    .select('id, email, username, role, not_active, deleted, created_at, updated_at')
    .eq('id', id)
    .eq('is_system_account', false)
    .single()

  if (userError || !user) {
    throw new NotFoundError('用户不存在')
  }

  // ─── 4. 查询私有文档统计 ───
  const { count, error: countError } = await adminClient
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', id)
    .eq('document_scope', 'private')

  if (countError) {
    console.error('[noter-admin] User private docs count error:', countError.message)
  }

  // ─── 5. 格式化响应 ───
  return success({
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    role: user.role,
    notActive: user.not_active,
    deleted: user.deleted,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    privateDocumentCount: count ?? 0
  })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
