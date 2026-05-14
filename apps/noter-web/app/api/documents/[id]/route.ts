import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { documentIdSchema } from '@/utils/feature/documents/schemas'
import type { Tag, DocumentContent, DocumentSummary, DocumentMindmap } from '@/types/document'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/documents/[id]
 * 查询文档详情 + 关联 document_contents + 标签 + document_summaries + document_mindmaps
 */
export const GET = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 查询文档主表
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (docError || !document) {
    return error('文档不存在', 404)
  }

  // 并行查询关联数据
  const [contentResult, tagsResult, summaryResult, mindmapResult] = await Promise.all([
    // 查询 document_contents
    supabase
      .from('document_contents')
      .select('id, user_id, document_id, markdown_content, outline, metadata')
      .eq('document_id', id)
      .eq('deleted', 0)
      .single(),

    // 查询标签（通过 document_tags 关联）
    supabase
      .from('document_tags')
      .select('tag_id, tags(id, name, color, description)')
      .eq('document_id', id)
      .eq('user_id', user.id)
      .eq('deleted', 0),

    // 查询 document_summaries
    supabase
      .from('document_summaries')
      .select(
        'id, document_id, summary, key_points, todos, keywords, suitable_scenarios, model_name, generated_at'
      )
      .eq('document_id', id)
      .eq('deleted', 0)
      .single(),

    // 查询 document_mindmaps
    supabase
      .from('document_mindmaps')
      .select('id, document_id, mindmap_json, markdown_outline, model_name, generated_at')
      .eq('document_id', id)
      .eq('deleted', 0)
      .single()
  ])

  // 组装 document_contents
  const content: DocumentContent | null = contentResult.data
    ? {
        id: contentResult.data.id,
        userId: contentResult.data.user_id,
        documentId: contentResult.data.document_id,
        markdownContent: contentResult.data.markdown_content,
        outline: contentResult.data.outline,
        metadata: contentResult.data.metadata
      }
    : null

  // 组装标签
  const tags: Tag[] = (tagsResult.data ?? [])
    .map((row) => row.tags as unknown as Tag | null)
    .filter((tag): tag is Tag => tag !== null)

  // 组装 summary
  const summary: DocumentSummary | null = summaryResult.data
    ? {
        id: summaryResult.data.id,
        documentId: summaryResult.data.document_id,
        summary: summaryResult.data.summary,
        keyPoints: summaryResult.data.key_points,
        todos: summaryResult.data.todos,
        keywords: summaryResult.data.keywords,
        suitableScenarios: summaryResult.data.suitable_scenarios,
        modelName: summaryResult.data.model_name,
        generatedAt: summaryResult.data.generated_at
      }
    : null

  // 组装 mindmap
  const mindmap: DocumentMindmap | null = mindmapResult.data
    ? {
        id: mindmapResult.data.id,
        documentId: mindmapResult.data.document_id,
        mindmapJson: mindmapResult.data.mindmap_json,
        markdownOutline: mindmapResult.data.markdown_outline,
        modelName: mindmapResult.data.model_name,
        generatedAt: mindmapResult.data.generated_at
      }
    : null

  // 组装完整文档详情
  const detail = {
    id: document.id,
    userId: document.user_id,
    title: document.title,
    originalFilename: document.original_filename,
    fileExt: document.file_ext,
    mimeType: document.mime_type,
    fileSize: document.file_size,
    originalBucket: document.original_bucket,
    originalStoragePath: document.original_storage_path,
    status: document.status,
    parseStatus: document.parse_status,
    vectorStatus: document.vector_status,
    summaryStatus: document.summary_status,
    mindmapStatus: document.mindmap_status,
    shortDescription: document.short_description,
    wordCount: document.word_count,
    pageCount: document.page_count,
    language: document.language,
    isFavorite: document.is_favorite,
    isArchived: document.is_archived,
    deleted: document.deleted,
    folderId: document.folder_id,
    tags,
    content,
    summary,
    mindmap,
    createdAt: document.created_at,
    updatedAt: document.updated_at
  }

  return success(detail)
})

/**
 * DELETE /api/documents/[id]
 * 软删除文档（设置 deleted=1, deleted_at=now()）
 */
export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 先检查文档是否存在
  const { data: existing, error: findError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (findError || !existing) {
    return error('文档不存在或已删除', 404)
  }

  // 软删除：设置 deleted=1, deleted_at=now()
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      deleted: 1,
      deleted_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)

  if (updateError) {
    return error(updateError.message, 500)
  }

  return success(null, '删除成功')
})
