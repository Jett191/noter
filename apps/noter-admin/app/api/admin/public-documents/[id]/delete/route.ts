import 'server-only'

/**
 * POST /api/admin/public-documents/[id]/delete
 *
 * 公共文档软删除:SET documents.deleted=1, deleted_at=now()
 * 不修改 versions / tags / category 关联数据。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 §Correctness Properties (Property 4):
 *   - 受 requireAdmin() 保护
 *   - 校验文档存在且 document_scope='public',否则 404
 *   - 仅设置 deleted=1 与 deleted_at,不动 public_document_versions / document_tags / public_category_id
 *   - 成功后写 audit log (action_type: 'public_document.delete', target_resource_type: 'public_document')
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

async function handler(request: Request, ctx: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: documentId } = await params

  // ─── 3. 校验文档存在且为公共文档 ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select('id, title, document_scope, deleted')
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
  }

  // ─── 4. 软删除:仅设置 deleted=1 与 deleted_at ───
  const { error: updateError } = await adminClient
    .from('documents')
    .update({ deleted: 1, deleted_at: new Date().toISOString() })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`软删除公共文档失败: ${updateError.message}`)
  }

  // ─── 5. 写审计日志 ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_document.delete',
    targetResourceType: 'public_document',
    targetResourceId: documentId,
    targetResourceLabel: document.title,
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
