import 'server-only'

/**
 * GET /api/admin/users
 *
 * 用户列表接口:分页 + 邮箱搜索 + 状态筛选。
 *
 * 设计参见 design.md §6.1 (用户管理) 与 Requirements 7:
 *   - 受 requireAdmin() 保护,admin 或 super_admin 均可访问
 *   - 查询始终附加 is_system_account=false(不展示系统账号)
 *   - 支持 page / pageSize / email / status 查询参数
 *   - 状态映射:
 *       normal  → not_active=0 AND deleted=0
 *       blocked → not_active=1
 *       deleted → deleted=1
 *   - 邮箱搜索使用 ILIKE 模式匹配
 *   - 返回分页结果 { items, total }
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const VALID_PAGE_SIZES = [20, 50, 100] as const
const VALID_STATUSES = ['all', 'normal', 'blocked', 'deleted'] as const

type PageSize = (typeof VALID_PAGE_SIZES)[number]
type Status = (typeof VALID_STATUSES)[number]

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 解析查询参数 ───
  const url = new URL(request.url)

  const pageParam = url.searchParams.get('page')
  const pageSizeParam = url.searchParams.get('pageSize')
  const emailParam = url.searchParams.get('email')
  const statusParam = url.searchParams.get('status')

  const page = pageParam ? parseInt(pageParam, 10) : 1
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20
  const status: Status = (statusParam as Status) || 'all'

  // ─── 3. 参数校验 ───
  if (isNaN(page) || page < 1) {
    throw new ValidationError('page 参数无效,必须为正整数')
  }
  if (!VALID_PAGE_SIZES.includes(pageSize as PageSize)) {
    throw new ValidationError('pageSize 参数无效,允许值: 20, 50, 100')
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError('status 参数无效,允许值: all, normal, blocked, deleted')
  }

  // ─── 4. 构建查询 ───
  const adminClient = getSupabaseAdmin()
  const offset = (page - 1) * pageSize

  let query = adminClient
    .from('profiles')
    .select('id, email, username, role, not_active, deleted, created_at', {
      count: 'exact'
    })
    .eq('is_system_account', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // ─── 5. 状态筛选 ───
  if (status === 'normal') {
    query = query.eq('not_active', 0).eq('deleted', 0)
  } else if (status === 'blocked') {
    query = query.eq('not_active', 1)
  } else if (status === 'deleted') {
    query = query.eq('deleted', 1)
  }
  // status === 'all' → 不加额外筛选

  // ─── 6. 邮箱搜索 ───
  if (emailParam && emailParam.trim()) {
    query = query.ilike('email', `%${emailParam.trim()}%`)
  }

  // ─── 7. 执行查询 ───
  const { data, count, error: queryError } = await query

  if (queryError) {
    console.error('[noter-admin] Users list query error:', queryError.message)
    throw new Error('查询用户列表失败')
  }

  // ─── 8. 格式化响应 ───
  const items = (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    role: row.role,
    notActive: row.not_active,
    deleted: row.deleted,
    createdAt: row.created_at
  }))

  return success({ items, total: count ?? 0 })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
