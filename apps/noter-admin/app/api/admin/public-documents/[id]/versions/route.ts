import 'server-only'

/**
 * GET /api/admin/public-documents/[id]/versions
 *
 * 公共文档版本列表接口:返回指定公共文档的所有版本快照,按 version_no DESC 排序。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 Requirements 17:
 *   - 受 requireAdmin() 保护
 *   - 校验文档存在且 document_scope='public',否则 404
 *   - 查询 public_document_versions WHERE document_id = :id
 *   - JOIN profiles 获取 editor_email(通过 editor_user_id）
 *   - 按 version_no DESC 排序
 *   - 返回: version_no, change_note, editor_email, created_at, content_length
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(_request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: documentId } = await params

  // ─── 3. 校验文档存在且为公共文档 ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
  }

  // ─── 4. 查询版本列表,JOIN profiles 获取 editor_email ───
  const { data: versions, error: versionsError } = await adminClient
    .from('public_document_versions')
    .select(
      `
      version_no,
      change_note,
      markdown_content,
      created_at,
      editor_user_id,
      profiles!public_document_versions_editor_user_id_fkey (
        email
      )
    `
    )
    .eq('document_id', documentId)
    .order('version_no', { ascending: false })

  if (versionsError) {
    throw new Error(`Failed to query versions: ${versionsError.message}`)
  }

  // ─── 5. 格式化响应 ───
  const items = (versions ?? []).map((v) => {
    const profile = v.profiles as unknown as { email: string } | null
    return {
      versionNo: v.version_no,
      changeNote: v.change_note,
      editorEmail: profile?.email ?? null,
      createdAt: v.created_at,
      contentLength: v.markdown_content ? v.markdown_content.length : 0
    }
  })

  return success({ items })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
