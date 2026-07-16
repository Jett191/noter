import 'server-only'

/**
 * POST /api/admin/users/[id]/role
 *
 * 角色切换:仅 super_admin 可调用,只允许 user ↔ admin 切换。
 *
 * 设计参见 design.md §6.1 (用户管理) 与 §Correctness Properties (Property 2):
 *   - 受 requireAdmin() 保护
 *   - 仅 super_admin 可调用;admin 调用 → 403
 *   - body: { role: 'user' | 'admin' }
 *   - 权限校验:
 *       目标为 super_admin → 404(不暴露存在性)
 *       目标为 is_system_account=true → 404
 *       操作自身 → 409
 *       目标当前 role 与请求 role 相同 → 409
 *   - 使用行锁模式(SELECT → 校验 → UPDATE)防并发
 *   - 成功后写 audit log (action_type: 'user.role_change', target_resource_type: 'user',
 *     metadata: { oldRole, newRole })
 */

import {
  withRouteHandler,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError
} from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

/** 允许设置的目标角色白名单 */
const ALLOWED_ROLES = ['user', 'admin'] as const
type AllowedRole = (typeof ALLOWED_ROLES)[number]

function isAllowedRole(value: unknown): value is AllowedRole {
  return typeof value === 'string' && (ALLOWED_ROLES as readonly string[]).includes(value)
}

async function handler(request: Request, ctx: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 仅 super_admin 可调用 ───
  if (admin.role !== 'super_admin') {
    throw new ForbiddenError('仅超级管理员可执行角色切换')
  }

  // ─── 3. 获取路径参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: targetId } = await params

  // ─── 4. 自我保护:不能操作自身 ───
  if (targetId === admin.userId) {
    throw new ConflictError('不能操作自身')
  }

  // ─── 5. 解析并校验请求体 ───
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ValidationError('请求体必须为有效 JSON')
  }

  const { role: newRole } = body as { role?: unknown }

  if (!isAllowedRole(newRole)) {
    throw new ValidationError('role 必须为 "user" 或 "admin"')
  }

  // ─── 6. 查询目标用户(行锁模式:SELECT → 校验 → UPDATE) ───
  const adminClient = getSupabaseAdmin()
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('id, email, role, is_system_account')
    .eq('id', targetId)
    .single()

  if (targetError || !target) {
    throw new NotFoundError('用户不存在')
  }

  // ─── 7. 系统账号 → 404 ───
  if (target.is_system_account) {
    throw new NotFoundError('用户不存在')
  }

  // ─── 8. 目标为 super_admin → 404 ───
  if (target.role === 'super_admin') {
    throw new NotFoundError('用户不存在')
  }

  // ─── 9. 目标当前 role 与请求 role 相同 → 409 ───
  if (target.role === newRole) {
    throw new ConflictError('目标用户已是该角色')
  }

  // ─── 10. 执行角色切换(紧跟 SELECT 的 UPDATE,service_role 全权限) ───
  const oldRole = target.role
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ role: newRole })
    .eq('id', targetId)
    .eq('role', oldRole) // 乐观锁:确保 role 未被并发修改

  if (updateError) {
    throw new Error(`角色切换失败: ${updateError.message}`)
  }

  // ─── 11. 写审计日志 ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'user.role_change',
    targetResourceType: 'user',
    targetResourceId: targetId,
    targetResourceLabel: target.email,
    metadata: { oldRole, newRole },
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
