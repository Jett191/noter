import 'server-only'

/**
 * GET /api/admin/public-documents/[id]
 *
 * 公共文档详情接口:返回基础信息 + 处理状态 + 关联分类/标签 + markdown_content + latestVersionNo + 临时签名 URL。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 Requirements 14/15:
 *   - 受 requireAdmin() 保护
 *   - 查询 documents 表,强制 document_scope='public'
 *   - 关联查询 public_categories、document_tags + tags、document_contents
 *   - 查询 public_document_versions 获取最大 version_no
 *   - 通过 Supabase Storage createSignedUrl 生成 1 小时临时签名 URL
 *   - 文档不存在或非 public scope 返回 404
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

  // ─── 3. 查询文档基础信息(强制 document_scope='public') ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select(
      `
      id,
      title,
      file_name,
      file_size,
      file_ext,
      status,
      short_description,
      language,
      storage_path,
      document_scope,
      public_category_id,
      created_at,
      updated_at,
      public_categories (
        id,
        name
      )
    `
    )
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
  }

  // ─── 4. 查询关联标签 ───
  const { data: docTags } = await adminClient
    .from('document_tags')
    .select(
      `
      tags (
        id,
        name
      )
    `
    )
    .eq('document_id', documentId)

  const tags: Array<{ id: string; name: string }> = []
  if (docTags) {
    for (const row of docTags) {
      const tag = row.tags as unknown as { id: string; name: string } | null
      if (tag) {
        tags.push({ id: tag.id, name: tag.name })
      }
    }
  }

  // ─── 5. 查询 markdown_content ───
  const { data: contentRow } = await adminClient
    .from('document_contents')
    .select('markdown_content')
    .eq('document_id', documentId)
    .single()

  const markdownContent = contentRow?.markdown_content ?? null

  // ─── 6. 查询 latestVersionNo ───
  const { data: versionRow } = await adminClient
    .from('public_document_versions')
    .select('version_no')
    .eq('document_id', documentId)
    .order('version_no', { ascending: false })
    .limit(1)
    .single()

  const latestVersionNo = versionRow?.version_no ?? null

  // ─── 7. 生成临时签名 URL(1 小时有效) ───
  let signedUrl: string | null = null
  if (document.storage_path) {
    // storage_path 格式通常为 "bucket-name/path/to/file" 或仅 "path/to/file"
    // 根据项目约定,解析 bucket 和 path
    const storagePath = document.storage_path as string
    const slashIndex = storagePath.indexOf('/')
    if (slashIndex > 0) {
      const bucket = storagePath.substring(0, slashIndex)
      const filePath = storagePath.substring(slashIndex + 1)

      const { data: signedData } = await adminClient.storage
        .from(bucket)
        .createSignedUrl(filePath, 3600)

      signedUrl = signedData?.signedUrl ?? null
    }
  }

  // ─── 8. 格式化响应 ───
  const category = document.public_categories as unknown as {
    id: string
    name: string
  } | null

  return success({
    id: document.id,
    title: document.title,
    fileName: document.file_name,
    fileSize: document.file_size,
    fileExt: document.file_ext,
    status: document.status,
    shortDescription: document.short_description,
    language: document.language,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    category: category ? { id: category.id, name: category.name } : null,
    tags,
    markdownContent,
    latestVersionNo,
    signedUrl
  })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
