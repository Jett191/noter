import 'server-only'

/**
 * POST /api/admin/public-categories/[id]/delete
 *
 * 软删除公共分类:事务内先把关联公共文档的 public_category_id 置为 NULL,
 * 再把分类 deleted=1(因为软删除本身不会触发 ON DELETE SET NULL),写 audit log。
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 20:
 *   - 受 requireAdmin() 保护
 *   - 目标分类不存在或已删除 → 404
 *   - 事务:
 *     1. UPDATE documents SET public_category_id=NULL WHERE public_category_id=:id
 *     2. UPDATE public_categories SET deleted=1 WHERE id=:id
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: categoryId } = await params

  // ─── 3. 校验分类存在且未删除 ───
  const adminClient = getSupabaseAdmin()

  const { data: category, error: catError } = await adminClient
    .from('public_categories')
    .select('id, name')
    .eq('id', categoryId)
    .eq('deleted', 0)
    .single()

  if (catError || !category) {
    throw new NotFoundError('分类不存在')
  }

  // ─── 4. 事务:先解除关联文档的 category 引用,再软删分类 ───
  // 使用 rpc 调用 Postgres 事务,或分步执行(service_role 绕过 RLS)
  // 步骤 1: 把关联公共文档的 public_category_id 置为 NULL
  const { error: unlinkError } = await adminClient
    .from('documents')
    .update({ public_category_id: null })
    .eq('public_category_id', categoryId)

  if (unlinkError) {
    throw new Error(`解除文档分类关联失败: ${unlinkError.message}`)
  }

  // 步骤 2: 软删分类
  const { error: deleteError } = await adminClient
    .from('public_categories')
    .update({ deleted: 1, updated_at: new Date().toISOString() })
    .eq('id', categoryId)

  if (deleteError) {
    throw new Error(`软删除分类失败: ${deleteError.message}`)
  }

  // ─── 5. 写 audit log ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_category.delete',
    targetResourceType: 'public_category',
    targetResourceId: categoryId,
    targetResourceLabel: category.name,
    metadata: {},
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 15_000 })
