import 'server-only'

/**
 * GET /api/admin/documents
 *
 * 普通用户私有文档列表:强制 document_scope='private',JOIN profiles 带 owner 信息。
 *
 * 设计参见 design.md §6.4 与 Requirements 22:
 *   - 受 requireAdmin() 保护
 *   - 强制 document_scope='private'(不展示公共文档）
 *   - JOIN profiles 获取 owner email/username
 *   - 支持 page / pageSize / ownerEmail / status 查询参数
 *   - 状态映射:
 *       all       → 不加额外筛选
 *       normal    → deleted=0
 *       deleted   → deleted=1
 *   - ownerEmail 搜索使用 profiles.email ILIKE
 *   - 返回分页结果 { items, total }
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const VALID_PAGE_SIZES = [20, 50, 100] as const
const VALID_STATUSES = ['all', 'normal', 'deleted'] as const

type PageSize = (typeof VALID_PAGE_SIZES)[number]
type Status = (typeof VALID_STATUSES)[number]

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 解析查询参数 ───
  const url = new URL(request.url)

  const pageParam = url.searchParams.get('page')
  const pageSizeParam = url.searchParams.get('pageSize')
  const ownerEmailParam = url.searchParams.get('ownerEmail')
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
    throw new ValidationError('status 参数无效,允许值: all, normal, deleted')
  }

  // ─── 4. 构建查询 ───
  const adminClient = getSupabaseAdmin()
  const offset = (page - 1) * pageSize

  // 强制 document_scope='private',JOIN profiles 获取 owner 信息
  let query = adminClient
    .from('documents')
    .select(
      'id, title, status, deleted, created_at, updated_at, user_id, profiles!inner(id, email, username)',
      { count: 'exact' }
    )
    .eq('document_scope', 'private')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // ─── 5. 状态筛选 ───
  if (status === 'normal') {
    query = query.eq('deleted', 0)
  } else if (status === 'deleted') {
    query = query.eq('deleted', 1)
  }
  // status === 'all' → 不加额外筛选

  // ─── 6. owner 邮箱搜索 ───
  if (ownerEmailParam && ownerEmailParam.trim()) {
    query = query.ilike('profiles.email', `%${ownerEmailParam.trim()}%`)
  }

  // ─── 7. 执行查询 ───
  const { data, count, error: queryError } = await query

  if (queryError) {
    console.error('[noter-admin] Documents list query error:', queryError.message)
    throw new Error('查询文档列表失败')
  }

  // ─── 8. 格式化响应 ───
  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const profiles = row.profiles as { id: string; email: string; username: string | null } | null
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      deleted: row.deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      owner: profiles
        ? {
            id: profiles.id,
            email: profiles.email,
            username: profiles.username ?? null
          }
        : null
    }
  })

  return success({ items, total: count ?? 0 })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
