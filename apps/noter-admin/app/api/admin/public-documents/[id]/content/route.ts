import 'server-only'

/**
 * PUT /api/admin/public-documents/[id]/content
 *
 * 公共文档内容更新接口:归档当前 markdown 为新版本 → 更新 document_contents → status=processing。
 *
 * 设计参见 design.md §6.2 / §7.3:
 *   - 受 requireAdmin() 保护
 *   - body: { markdownContent: string; changeNote?: string }
 *   - 校验文档存在且 document_scope='public',否则 404
 *   - No-op 检测:新内容与当前内容相同 → 返回 { noChange: true },不创建版本
 *   - 归档当前 markdown:INSERT public_document_versions(version_no = max+1, markdown_content = oldMd)
 *   - 更新 document_contents.markdown_content = newMd
 *   - 更新 documents.status = 'processing'
 *   - 异步触发 triggerDerivativePipeline(fire-and-forget)
 *   - 写 audit_log: public_document.content_update,metadata 不含完整 markdown(仅 char counts)
 *   - 使用 withRouteHandler 包装,15s 超时
 *
 * 注:Supabase JS 不支持原生事务,使用 service_role 客户端顺序操作。
 */

import { withRouteHandler, NotFoundError, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'
import { triggerDerivativePipeline } from '@/lib/pipeline/triggerDerivativePipeline'

interface ContentUpdateBody {
  markdownContent: string
  changeNote?: string
}

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: documentId } = await params

  // ─── 3. 解析并校验请求体 ───
  const body = (await request.json()) as ContentUpdateBody

  if (!body.markdownContent || typeof body.markdownContent !== 'string') {
    throw new ValidationError('markdownContent is required and must be a string')
  }

  const newMarkdown = body.markdownContent
  const changeNote = body.changeNote ?? null

  // ─── 4. 校验文档存在且为 public scope ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select('id, title, document_scope, user_id')
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
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

  // ─── 6. No-op 检测:内容相同则直接返回 ───
  if (newMarkdown === currentMarkdown) {
    return success({ noChange: true })
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
    change_note: changeNote,
    editor_user_id: admin.userId
  })

  if (insertVersionError) {
    throw new ValidationError('failed_to_archive_version', { detail: insertVersionError.message })
  }

  // ─── 9. 更新 document_contents.markdown_content ───
  const { error: updateContentError } = await adminClient
    .from('document_contents')
    .update({
      markdown_content: newMarkdown,
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

  // ─── 12. 写 audit log(metadata 不含完整 markdown,仅 char counts) ───
  void writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_document.content_update',
    targetResourceType: 'public_document',
    targetResourceId: documentId,
    targetResourceLabel: document.title,
    metadata: {
      versionNo: nextVersionNo,
      previousContentLength: currentMarkdown.length,
      newContentLength: newMarkdown.length,
      changeNote: changeNote ?? undefined
    },
    request
  })

  // ─── 13. 返回成功响应 ───
  return success({
    id: documentId,
    newVersionNo: nextVersionNo,
    status: 'processing'
  })
}

export const PUT = withRouteHandler(handler, { timeoutMs: 15_000 })
