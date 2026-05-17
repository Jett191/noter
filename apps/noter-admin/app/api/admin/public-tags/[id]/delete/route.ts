import 'server-only'

/**
 * POST /api/admin/public-tags/[id]/delete
 *
 * 软删除公共标签:事务内先删除 document_tags 关联,再软删标签(deleted=1),写 audit log。
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 21:
 *   - 受 requireAdmin() 保护
 *   - 目标标签必须 is_official=true AND deleted=0,否则 404
 *   - 事务:
 *     1. DELETE FROM document_tags WHERE tag_id=:id
 *     2. UPDATE tags SET deleted=1 WHERE id=:id
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
  const { id: tagId } = await params

  // ─── 3. 校验标签存在且为公共标签(is_official=true AND deleted=0) ───
  const adminClient = getSupabaseAdmin()

  const { data: tag, error: tagError } = await adminClient
    .from('tags')
    .select('id, name')
    .eq('id', tagId)
    .eq('is_official', true)
    .eq('deleted', 0)
    .single()

  if (tagError || !tag) {
    throw new NotFoundError('公共标签不存在')
  }

  // ─── 4. 事务:先删除 document_tags 关联,再软删标签 ───
  // 步骤 1: 删除 document_tags 中该标签的所有关联
  const { error: unlinkError } = await adminClient
    .from('document_tags')
    .delete()
    .eq('tag_id', tagId)

  if (unlinkError) {
    throw new Error(`删除标签关联失败: ${unlinkError.message}`)
  }

  // 步骤 2: 软删标签
  const { error: deleteError } = await adminClient
    .from('tags')
    .update({ deleted: 1, updated_at: new Date().toISOString() })
    .eq('id', tagId)

  if (deleteError) {
    throw new Error(`软删除标签失败: ${deleteError.message}`)
  }

  // ─── 5. 写 audit log ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_tag.delete',
    targetResourceType: 'public_tag',
    targetResourceId: tagId,
    targetResourceLabel: tag.name,
    metadata: {},
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 15_000 })
