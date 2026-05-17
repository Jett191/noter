import 'server-only'

/**
 * POST /api/admin/users/[id]/send-password-reset
 *
 * 触发 Supabase Auth 密码恢复邮件。
 *
 * 设计参见 design.md §6.1 (用户管理) 与 §Correctness Properties (Property 2):
 *   - 受 requireAdmin() 保护
 *   - 权限矩阵:
 *       admin 只能操作 role='user' 的目标
 *       super_admin 可操作 role='user' 或 role='admin' 的目标
 *       目标为 super_admin → 404(不暴露存在性）
 *       目标为 is_system_account=true → 404
 *       操作自身 → 409
 *   - 调用 Supabase Auth admin API generateLink({ type: 'recovery' }) 发送恢复邮件
 *   - 响应中不返回任何明文密码或 token
 *   - 成功后写 audit log (action_type: 'user.send_password_reset', target_resource_type: 'user')
 *   - audit log metadata 不含 token 或 link
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

  // ─── 3. 自我保护：不能操作自身 ───
  if (targetId === admin.userId) {
    throw new ConflictError('不能操作自身')
  }

  // ─── 4. 查询目标用户 ───
  const adminClient = getSupabaseAdmin()
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('id, email, role, is_system_account')
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

  // ─── 8. 调用 Supabase Auth 发送密码恢复邮件 ───
  // 使用 generateLink 触发恢复流程，Supabase 会自动发送邮件
  const { error: resetError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: target.email
  })

  if (resetError) {
    throw new Error(`发送密码重置邮件失败: ${resetError.message}`)
  }

  // ─── 9. 写审计日志（metadata 不含 token 或 link） ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'user.send_password_reset',
    targetResourceType: 'user',
    targetResourceId: targetId,
    targetResourceLabel: target.email,
    metadata: { targetRole: target.role },
    request
  })

  // ─── 10. 返回成功（不含任何敏感信息） ───
  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
