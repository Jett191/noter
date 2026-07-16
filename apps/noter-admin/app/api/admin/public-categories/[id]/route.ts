import 'server-only'

/**
 * PATCH /api/admin/public-categories/[id]
 *
 * 编辑公共分类:更新 name / description / sort_order,写 audit log。
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 20:
 *   - 受 requireAdmin() 保护
 *   - name 在未删除范围内唯一(数据库 partial unique index 保证),冲突 → 409
 *   - 目标分类不存在或已删除 → 404
 */

import { withRouteHandler, NotFoundError, ValidationError, ConflictError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

interface UpdateCategoryBody {
  name?: string
  description?: string | null
  sortOrder?: number
}

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: categoryId } = await params

  // ─── 3. 解析请求体 ───
  const body = (await request.json()) as UpdateCategoryBody

  // ─── 4. 至少需要一个字段 ───
  if (body.name === undefined && body.description === undefined && body.sortOrder === undefined) {
    throw new ValidationError('至少需要提供一个更新字段')
  }

  if (body.name !== undefined && !body.name.trim()) {
    throw new ValidationError('name 不能为空')
  }

  // ─── 5. 校验分类存在且未删除 ───
  const adminClient = getSupabaseAdmin()

  const { data: category, error: catError } = await adminClient
    .from('public_categories')
    .select('id, name, description, sort_order')
    .eq('id', categoryId)
    .eq('deleted', 0)
    .single()

  if (catError || !category) {
    throw new NotFoundError('分类不存在')
  }

  // ─── 6. 构建更新字段 ───
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (body.name !== undefined) {
    updateFields.name = body.name.trim()
  }
  if (body.description !== undefined) {
    updateFields.description = body.description?.trim() || null
  }
  if (body.sortOrder !== undefined) {
    updateFields.sort_order = body.sortOrder
  }

  // ─── 7. 执行更新 ───
  const { error: updateError } = await adminClient
    .from('public_categories')
    .update(updateFields)
    .eq('id', categoryId)

  if (updateError) {
    // 23505 = unique_violation (name 重复)
    if ((updateError as { code?: string }).code === '23505') {
      throw new ConflictError('分类名称已存在')
    }
    throw new Error(`更新分类失败: ${updateError.message}`)
  }

  // ─── 8. 写 audit log ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_category.update',
    targetResourceType: 'public_category',
    targetResourceId: categoryId,
    targetResourceLabel: (updateFields.name as string) ?? category.name,
    metadata: {
      before: {
        name: category.name,
        description: category.description,
        sortOrder: category.sort_order
      },
      after: {
        name: updateFields.name ?? category.name,
        description:
          updateFields.description !== undefined ? updateFields.description : category.description,
        sortOrder: updateFields.sort_order ?? category.sort_order
      }
    },
    request
  })

  return success({ id: categoryId, updated: true })
}

export const PATCH = withRouteHandler(handler, { timeoutMs: 10_000 })
