import 'server-only'

/**
 * POST /api/admin/users/[id]/block
 *
 * 封禁用户:SET profiles.not_active = 1
 *
 * 设计参见 design.md §6.1 (用户管理) 与 §Correctness Properties (Property 2):
 *   - 受 requireAdmin() 保护
 *   - 权限矩阵:
 *       admin 只能操作 role='user' 的目标
 *       super_admin 可操作 role='user' 或 role='admin' 的目标
 *       目标为 super_admin → 404(不暴露存在性)
 *       目标为 is_system_account=true → 404
 *       操作自身 → 409
 *   - 成功后写 audit log (action_type: 'user.block', target_resource_type: 'user')
 */

import { withRouteHandler, NotFoundError, ConflictError, ForbiddenError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

async function handler(request: Request, ctx: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路径参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: targetId } = await params

  // ─── 3. 自我保护:不能操作自身 ───
  if (targetId === admin.userId) {
    throw new ConflictError('不能操作自身')
  }

  // ─── 4. 查询目标用户 ───
  const adminClient = getSupabaseAdmin()
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('id, email, role, is_system_account, not_active')
    .eq('id', targetId)
    .single()

  if (targetError || !target) {
    throw new NotFoundError('用户不存在')
  }

  // ─── 5. 系统账号 → 404 ───
  if (target.is_system_account) {
    throw new NotFoundError('用户不存在')
  }

  // ─── 6. 目标为 super_admin → 404 ───
  if (target.role === 'super_admin') {
    throw new NotFoundError('用户不存在')
  }

  // ─── 7. 权限矩阵校验 ───
  if (admin.role === 'admin' && target.role !== 'user') {
    throw new ForbiddenError('权限不足')
  }

  // ─── 8. 执行封禁 ───
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ not_active: 1 })
    .eq('id', targetId)

  if (updateError) {
    throw new Error(`封禁用户失败: ${updateError.message}`)
  }

  // ─── 9. 写审计日志 ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'user.block',
    targetResourceType: 'user',
    targetResourceId: targetId,
    targetResourceLabel: target.email,
    metadata: { targetRole: target.role },
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
