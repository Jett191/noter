import 'server-only'

/**
 * GET  /api/admin/public-categories — 列表 + 关联文档数聚合
 * POST /api/admin/public-categories — 新建分类 + name 唯一校验,写 audit log
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 20:
 *   - 受 requireAdmin() 保护
 *   - GET: 返回所有未删除分类,附带关联公共文档数
 *   - POST: 新建分类,name 在未删除范围内唯一(数据库 partial unique index 保证)
 *     捕获 23505 → 409
 */

import { withRouteHandler, ValidationError, ConflictError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

// ─── GET: 列表 + 关联文档数聚合 ───

async function getHandler(request: Request): Promise<Response> {
  await requireAdmin()

  const adminClient = getSupabaseAdmin()

  // 查询所有未删除分类
  const { data: categories, error: catError } = await adminClient
    .from('public_categories')
    .select('id, name, description, sort_order, created_at, updated_at')
    .eq('deleted', 0)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (catError) {
    throw new Error(`查询分类列表失败: ${catError.message}`)
  }

  // 聚合每个分类关联的公共文档数
  const categoryIds = (categories ?? []).map((c) => c.id)

  let documentCounts: Record<string, number> = {}

  if (categoryIds.length > 0) {
    const { data: counts, error: countError } = await adminClient
      .from('documents')
      .select('public_category_id')
      .eq('document_scope', 'public')
      .eq('deleted', 0)
      .in('public_category_id', categoryIds)

    if (!countError && counts) {
      documentCounts = counts.reduce(
        (acc, row) => {
          const catId = (row as { public_category_id: string }).public_category_id
          acc[catId] = (acc[catId] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }
  }

  const items = (categories ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    sortOrder: cat.sort_order,
    createdAt: cat.created_at,
    updatedAt: cat.updated_at,
    documentCount: documentCounts[cat.id] || 0
  }))

  return success({ items })
}

// ─── POST: 新建分类 ───

interface CreateCategoryBody {
  name: string
  description?: string
  sortOrder?: number
}

async function postHandler(request: Request): Promise<Response> {
  const admin = await requireAdmin()

  // 解析请求体
  const body = (await request.json()) as CreateCategoryBody

  // 参数校验
  if (!body.name || !body.name.trim()) {
    throw new ValidationError('name 不能为空')
  }

  const adminClient = getSupabaseAdmin()

  // 插入分类(唯一约束由数据库 partial unique index 保证)
  const { data: created, error: insertError } = await adminClient
    .from('public_categories')
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      sort_order: body.sortOrder ?? 0
    })
    .select('id, name, description, sort_order, created_at, updated_at')
    .single()

  if (insertError) {
    // 23505 = unique_violation
    if ((insertError as { code?: string }).code === '23505') {
      throw new ConflictError('分类名称已存在')
    }
    throw new Error(`创建分类失败: ${insertError.message}`)
  }

  // 写 audit log
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_category.create',
    targetResourceType: 'public_category',
    targetResourceId: created.id,
    targetResourceLabel: created.name,
    metadata: { description: created.description, sortOrder: created.sort_order },
    request
  })

  return success(
    {
      id: created.id,
      name: created.name,
      description: created.description,
      sortOrder: created.sort_order,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    },
    201
  )
}

export const GET = withRouteHandler(getHandler, { timeoutMs: 10_000 })
export const POST = withRouteHandler(postHandler, { timeoutMs: 10_000 })
