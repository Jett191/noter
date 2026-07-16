import 'server-only'

/**
 * POST /api/admin/documents/[id]/delete
 *
 * 强制软删除普通用户私有文档:documents.deleted=1,写 audit log。
 *
 * 设计参见 design.md §6.4 与 Requirements 22:
 *   - 受 requireAdmin() 保护
 *   - 仅操作 document_scope='private' 的文档
 *   - 设置 documents.deleted=1
 *   - 写 audit log (action_type: 'document.force_delete', target_resource_type: 'document')
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

async function handler(request: Request, ctx: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路径参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: documentId } = await params

  // ─── 3. 查询目标文档(仅 private） ───
  const adminClient = getSupabaseAdmin()
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('id, title, document_scope, deleted, user_id')
    .eq('id', documentId)
    .eq('document_scope', 'private')
    .single()

  if (docError || !doc) {
    throw new NotFoundError('文档不存在')
  }

  // ─── 4. 执行软删除 ───
  const { error: updateError } = await adminClient
    .from('documents')
    .update({ deleted: 1 })
    .eq('id', documentId)

  if (updateError) {
    throw new Error(`软删除文档失败: ${updateError.message}`)
  }

  // ─── 5. 写审计日志 ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'document.force_delete',
    targetResourceType: 'document',
    targetResourceId: documentId,
    targetResourceLabel: doc.title ?? documentId,
    metadata: { ownerId: doc.user_id },
    request
  })

  return success({ success: true })
}

export const POST = withRouteHandler(handler, { timeoutMs: 10_000 })
