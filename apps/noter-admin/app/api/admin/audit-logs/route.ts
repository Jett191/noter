import 'server-only'

/**
 * GET /api/admin/audit-logs
 *
 * 审计日志列表:分页 + 多维度筛选,不提供写入端点。
 *
 * 设计参见 design.md §6.6 (审计日志) 与 Requirements 23:
 *   - 受 requireAdmin() 保护
 *   - 支持筛选:adminUserIds[] / actionTypes[] / startTime / endTime / targetResourceType / page / pageSize
 *   - 按 created_at DESC 排序
 *   - 返回 { items, total }
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const VALID_PAGE_SIZES = [20, 50, 100] as const
type PageSize = (typeof VALID_PAGE_SIZES)[number]

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 解析查询参数 ───
  const url = new URL(request.url)

  const pageParam = url.searchParams.get('page')
  const pageSizeParam = url.searchParams.get('pageSize')
  const adminUserIdsParam = url.searchParams.get('adminUserIds')
  const actionTypesParam = url.searchParams.get('actionTypes')
  const startTimeParam = url.searchParams.get('startTime')
  const endTimeParam = url.searchParams.get('endTime')
  const targetResourceTypeParam = url.searchParams.get('targetResourceType')

  const page = pageParam ? parseInt(pageParam, 10) : 1
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20

  // ─── 3. 参数校验 ───
  if (isNaN(page) || page < 1) {
    throw new ValidationError('page 参数无效,必须为正整数')
  }
  if (!VALID_PAGE_SIZES.includes(pageSize as PageSize)) {
    throw new ValidationError('pageSize 参数无效,允许值: 20, 50, 100')
  }

  // ─── 4. 构建查询 ───
  const adminClient = getSupabaseAdmin()
  const offset = (page - 1) * pageSize

  let query = adminClient
    .from('admin_audit_logs')
    .select(
      'id, admin_user_id, admin_email, action_type, target_resource_type, target_resource_id, target_resource_label, request_ip, metadata, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // ─── 5. 筛选:操作人 ───
  if (adminUserIdsParam && adminUserIdsParam.trim()) {
    const ids = adminUserIdsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length > 0) {
      query = query.in('admin_user_id', ids)
    }
  }

  // ─── 6. 筛选:操作类型 ───
  if (actionTypesParam && actionTypesParam.trim()) {
    const types = actionTypesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (types.length > 0) {
      query = query.in('action_type', types)
    }
  }

  // ─── 7. 筛选:时间范围 ───
  if (startTimeParam) {
    query = query.gte('created_at', startTimeParam)
  }
  if (endTimeParam) {
    query = query.lte('created_at', endTimeParam)
  }

  // ─── 8. 筛选:目标资源类型 ───
  if (targetResourceTypeParam && targetResourceTypeParam.trim()) {
    query = query.eq('target_resource_type', targetResourceTypeParam.trim())
  }

  // ─── 9. 执行查询 ───
  const { data, count, error: queryError } = await query

  if (queryError) {
    console.error('[noter-admin] Audit logs query error:', queryError.message)
    throw new Error('查询审计日志失败')
  }

  // ─── 10. 格式化响应 ───
  const items = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    adminEmail: row.admin_email,
    actionType: row.action_type,
    targetResourceType: row.target_resource_type,
    targetResourceId: row.target_resource_id,
    targetResourceLabel: row.target_resource_label,
    requestIp: row.request_ip,
    metadata: row.metadata,
    createdAt: row.created_at
  }))

  return success({ items, total: count ?? 0 })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
