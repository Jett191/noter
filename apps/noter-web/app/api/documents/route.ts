import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { listDocumentsSchema } from '@/utils/feature/documents/schemas'
import type { PaginatedResult, Document, Tag } from '@/types/document'

export const GET = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 解析查询参数
  const url = new URL(request.url)
  const rawParams: Record<string, unknown> = {
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    orderBy: url.searchParams.get('orderBy') ?? undefined,
    order: url.searchParams.get('order') ?? undefined,
    tagIds: url.searchParams.getAll('tagIds').length ? url.searchParams.getAll('tagIds') : undefined
  }

  const params = listDocumentsSchema.parse(rawParams)
  const { page, pageSize, tagIds, orderBy, order } = params

  // 计算分页范围
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 构建查询
  let query = supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('deleted', 0)

  // 标签筛选（OR 逻辑：文档关联了任一选中标签即匹配）
  if (tagIds && tagIds.length > 0) {
    const { data: taggedDocIds } = await supabase
      .from('document_tags')
      .select('document_id')
      .eq('user_id', user.id)
      .eq('deleted', 0)
      .in('tag_id', tagIds)

    const documentIds = [...new Set((taggedDocIds ?? []).map((row) => row.document_id))]

    if (documentIds.length === 0) {
      // 没有匹配的文档，直接返回空结果
      const result: PaginatedResult<Document> = {
        items: [],
        total: 0,
        page,
        pageSize
      }
      return success(result)
    }

    query = query.in('id', documentIds)
  }

  // 排序
  query = query.order(orderBy ?? 'created_at', {
    ascending: (order ?? 'desc') === 'asc'
  })

  // 分页
  query = query.range(from, to)

  const { data: documents, count, error: dbError } = await query

  if (dbError) {
    return error(dbError.message, 500)
  }

  // 获取文档关联的标签
  const docIds = (documents ?? []).map((doc) => doc.id)
  const tagsMap: Record<string, Tag[]> = {}

  if (docIds.length > 0) {
    const { data: docTags } = await supabase
      .from('document_tags')
      .select('document_id, tag_id, tags(id, name, color, description)')
      .eq('user_id', user.id)
      .eq('deleted', 0)
      .in('document_id', docIds)

    if (docTags) {
      for (const row of docTags) {
        const docId = row.document_id as string
        const tag = row.tags as unknown as Tag | null
        if (tag) {
          if (!tagsMap[docId]) {
            tagsMap[docId] = []
          }
          tagsMap[docId].push(tag)
        }
      }
    }
  }

  // 组装返回数据
  const items: Document[] = (documents ?? []).map((doc) => ({
    id: doc.id,
    userId: doc.user_id,
    title: doc.title,
    originalFilename: doc.original_filename,
    fileExt: doc.file_ext,
    mimeType: doc.mime_type,
    fileSize: doc.file_size,
    originalBucket: doc.original_bucket,
    originalStoragePath: doc.original_storage_path,
    status: doc.status,
    parseStatus: doc.parse_status,
    vectorStatus: doc.vector_status,
    summaryStatus: doc.summary_status,
    mindmapStatus: doc.mindmap_status,
    shortDescription: doc.short_description,
    wordCount: doc.word_count,
    pageCount: doc.page_count,
    language: doc.language,
    isFavorite: doc.is_favorite,
    isArchived: doc.is_archived,
    deleted: doc.deleted,
    tags: tagsMap[doc.id] ?? [],
    createdAt: doc.created_at,
    updatedAt: doc.updated_at
  }))

  const result: PaginatedResult<Document> = {
    items,
    total: count ?? 0,
    page,
    pageSize
  }

  return success(result)
})
