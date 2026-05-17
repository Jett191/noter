import 'server-only'

/**
 * POST /api/admin/public-documents/[id]/versions/[versionNo]/rollback
 *
 * 公共文档版本回滚接口:归档当前 markdown → 写回目标版本 markdown → status=processing。
 *
 * 设计参见 design.md §6.2 / §7.4:
 *   - 受 requireAdmin() 保护
 *   - 校验文档存在且 document_scope='public',否则 404
 *   - 获取目标版本(document_id + version_no),否则 404
 *   - No-op 拦截:目标版本 markdown 与当前 markdown 完全一致 → 409 (rollback_no_change)
 *   - 归档当前 markdown 为新版本(version_no = max+1, change_note = "回滚到版本 X")
 *   - 将目标版本 markdown 写回 document_contents
 *   - UPDATE documents SET status='processing'
 *   - 异步触发 triggerDerivativePipeline(fire-and-forget)
 *   - 写 audit_log: public_document.rollback
 *   - 使用 withRouteHandler 包装,15s 超时
 *
 * 注:Supabase JS 不支持原生事务,使用 service_role 客户端顺序操作。
 */

import { withRouteHandler, NotFoundError, ConflictError, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'
import { triggerDerivativePipeline } from '@/lib/pipeline/triggerDerivativePipeline'

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string; versionNo: string }> }
  const { id: documentId, versionNo: versionNoStr } = await params

  const targetVersionNo = parseInt(versionNoStr, 10)
  if (isNaN(targetVersionNo) || targetVersionNo < 1) {
    throw new NotFoundError('version_not_found')
  }

  // ─── 3. 校验文档存在且为 public scope ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select('id, title, user_id')
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
  }

  // ─── 4. 获取目标版本 ───
  const { data: targetVersion, error: targetVersionError } = await adminClient
    .from('public_document_versions')
    .select('version_no, markdown_content')
    .eq('document_id', documentId)
    .eq('version_no', targetVersionNo)
    .single()

  if (targetVersionError || !targetVersion) {
    throw new NotFoundError('version_not_found')
  }

  // ─── 5. 读取当前 markdown_content ───
  const { data: contentRow, error: contentError } = await adminClient
    .from('document_contents')
    .select('markdown_content')
    .eq('document_id', documentId)
    .single()

  if (contentError || !contentRow) {
    throw new NotFoundError('document_content_not_found')
  }

  const currentMarkdown: string = contentRow.markdown_content ?? ''
  const targetMarkdown: string = targetVersion.markdown_content

  // ─── 6. No-op 拦截:目标 markdown 与当前完全一致 → 409 ───
  if (targetMarkdown === currentMarkdown) {
    throw new ConflictError('rollback_no_change')
  }

  // ─── 7. 计算 nextVersionNo = max(version_no) + 1 ───
  const { data: maxVersionRow } = await adminClient
    .from('public_document_versions')
    .select('version_no')
    .eq('document_id', documentId)
    .order('version_no', { ascending: false })
    .limit(1)
    .single()

  const nextVersionNo = (maxVersionRow?.version_no ?? 0) + 1

  // ─── 8. 归档当前 markdown 为新版本 ───
  const { error: insertVersionError } = await adminClient.from('public_document_versions').insert({
    document_id: documentId,
    version_no: nextVersionNo,
    markdown_content: currentMarkdown,
    change_note: `回滚到版本 ${targetVersionNo}`,
    editor_user_id: admin.userId
  })

  if (insertVersionError) {
    throw new ValidationError('failed_to_archive_version', { detail: insertVersionError.message })
  }

  // ─── 9. 将目标版本 markdown 写回 document_contents ───
  const { error: updateContentError } = await adminClient
    .from('document_contents')
    .update({
      markdown_content: targetMarkdown,
      updated_at: new Date().toISOString()
    })
    .eq('document_id', documentId)

  if (updateContentError) {
    throw new ValidationError('failed_to_update_content', { detail: updateContentError.message })
  }

  // ─── 10. 更新 documents.status = 'processing' ───
  const { error: updateStatusError } = await adminClient
    .from('documents')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)

  if (updateStatusError) {
    throw new ValidationError('failed_to_update_status', { detail: updateStatusError.message })
  }

  // ─── 11. 异步触发 derivative pipeline(fire-and-forget) ───
  void triggerDerivativePipeline({
    documentId,
    userId: document.user_id
  })

  // ─── 12. 写 audit log ───
  void writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_document.rollback',
    targetResourceType: 'public_document',
    targetResourceId: documentId,
    targetResourceLabel: document.title,
    metadata: {
      targetVersionNo,
      archivedVersionNo: nextVersionNo,
      previousContentLength: currentMarkdown.length,
      restoredContentLength: targetMarkdown.length
    },
    request
  })

  // ─── 13. 返回成功响应 ───
  return success({
    id: documentId,
    rolledBackToVersion: targetVersionNo,
    archivedVersionNo: nextVersionNo,
    status: 'processing'
  })
}

export const POST = withRouteHandler(handler, { timeoutMs: 15_000 })
