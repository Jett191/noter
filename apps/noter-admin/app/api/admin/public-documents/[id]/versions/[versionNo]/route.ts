import 'server-only'

/**
 * GET /api/admin/public-documents/[id]/versions/[versionNo]
 *
 * 公共文档单版本详情接口:返回指定版本的 markdown_content 与当前文档的 markdown_content,
 * 用于前端双栏对比(版本快照 vs 当前内容)。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 Requirements 17:
 *   - 受 requireAdmin() 保护
 *   - 校验文档存在且 document_scope='public',否则 404
 *   - 查询 public_document_versions WHERE document_id AND version_no
 *   - 若版本不存在,返回 404
 *   - 返回: 版本 markdown_content + 当前 document_contents.markdown_content
 *   - 同时返回版本元数据: version_no, change_note, editor_email, created_at
 */

import { withRouteHandler, NotFoundError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(_request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string; versionNo: string }> }
  const { id: documentId, versionNo: versionNoStr } = await params

  const versionNo = parseInt(versionNoStr, 10)
  if (isNaN(versionNo) || versionNo < 1) {
    throw new NotFoundError('version_not_found')
  }

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

  // ─── 4. 查询指定版本,JOIN profiles 获取 editor_email ───
  const { data: version, error: versionError } = await adminClient
    .from('public_document_versions')
    .select(
      `
      version_no,
      markdown_content,
      change_note,
      created_at,
      editor_user_id,
      profiles!public_document_versions_editor_user_id_fkey (
        email
      )
    `
    )
    .eq('document_id', documentId)
    .eq('version_no', versionNo)
    .single()

  if (versionError || !version) {
    throw new NotFoundError('version_not_found')
  }

  // ─── 5. 获取当前文档的 markdown_content(用于双栏对比) ───
  const { data: currentContent, error: contentError } = await adminClient
    .from('document_contents')
    .select('markdown_content')
    .eq('document_id', documentId)
    .single()

  if (contentError || !currentContent) {
    throw new NotFoundError('document_content_not_found')
  }

  // ─── 6. 格式化响应 ───
  const profile = version.profiles as unknown as { email: string } | null

  return success({
    version: {
      versionNo: version.version_no,
      markdownContent: version.markdown_content,
      changeNote: version.change_note,
      editorEmail: profile?.email ?? null,
      createdAt: version.created_at
    },
    currentMarkdownContent: currentContent.markdown_content
  })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
