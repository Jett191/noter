import 'server-only'

/**
 * GET /api/admin/public-documents
 *
 * 公共文档列表接口:强制 document_scope='public',支持标题搜索/状态/分类/标签/已删除筛选。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 Requirements 14:
 *   - 受 requireAdmin() 保护,admin 或 super_admin 均可访问
 *   - 查询始终附加 document_scope='public'
 *   - 支持 page / pageSize / title / status / categoryId / tagIds / deleted 查询参数
 *   - 默认展示未删除文档 (deleted=0),除非显式传 deleted=1
 *   - 返回分页结果 { items, total },每条记录附带 latestVersionNo
 *   - latestVersionNo 通过查询 public_document_versions 获取每个文档的最大 version_no
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const VALID_PAGE_SIZES = [20, 50, 100] as const
const VALID_STATUSES = ['processing', 'ready', 'failed'] as const

type PageSize = (typeof VALID_PAGE_SIZES)[number]
type DocStatus = (typeof VALID_STATUSES)[number]

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 解析查询参数 ───
  const url = new URL(request.url)

  const pageParam = url.searchParams.get('page')
  const pageSizeParam = url.searchParams.get('pageSize')
  const titleParam = url.searchParams.get('title')
  const statusParam = url.searchParams.get('status')
  const categoryIdParam = url.searchParams.get('categoryId')
  const tagIdsParam = url.searchParams.get('tagIds')
  const deletedParam = url.searchParams.get('deleted')

  const page = pageParam ? parseInt(pageParam, 10) : 1
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20

  // ─── 3. 参数校验 ───
  if (isNaN(page) || page < 1) {
    throw new ValidationError('page 参数无效,必须为正整数')
  }
  if (!VALID_PAGE_SIZES.includes(pageSize as PageSize)) {
    throw new ValidationError('pageSize 参数无效,允许值: 20, 50, 100')
  }
  if (statusParam && !VALID_STATUSES.includes(statusParam as DocStatus)) {
    throw new ValidationError('status 参数无效,允许值: processing, ready, failed')
  }

  // deleted 参数校验:仅接受 '0' 或 '1'
  if (deletedParam && deletedParam !== '0' && deletedParam !== '1') {
    throw new ValidationError('deleted 参数无效,允许值: 0, 1')
  }

  // tagIds 解析:逗号分隔的 UUID 列表
  let tagIds: string[] = []
  if (tagIdsParam && tagIdsParam.trim()) {
    tagIds = tagIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  }

  // ─── 4. 构建查询 ───
  const adminClient = getSupabaseAdmin()
  const offset = (page - 1) * pageSize

  // 查询公共文档,关联 public_categories
  let query = adminClient
    .from('documents')
    .select(
      `
      id,
      title,
      file_name,
      file_size,
      status,
      public_category_id,
      created_at,
      public_categories (
        id,
        name
      )
    `,
      { count: 'exact' }
    )
    .eq('document_scope', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // ─── 5. 已删除筛选(默认展示未删除) ───
  const showDeleted = deletedParam === '1'
  if (showDeleted) {
    query = query.eq('deleted', 1)
  } else {
    query = query.eq('deleted', 0)
  }

  // ─── 6. 标题搜索 ───
  if (titleParam && titleParam.trim()) {
    query = query.ilike('title', `%${titleParam.trim()}%`)
  }

  // ─── 7. 状态筛选 ───
  if (statusParam) {
    query = query.eq('status', statusParam)
  }

  // ─── 8. 分类筛选 ───
  if (categoryIdParam && categoryIdParam.trim()) {
    query = query.eq('public_category_id', categoryIdParam.trim())
  }

  // ─── 9. 标签筛选 ───
  // 如果指定了 tagIds,需要通过 document_tags 关联表筛选
  // 使用 IN 查询:文档必须关联了指定标签中的至少一个
  if (tagIds.length > 0) {
    // 先查出关联了指定标签的文档 ID 列表
    const { data: taggedDocs, error: tagError } = await adminClient
      .from('document_tags')
      .select('document_id')
      .in('tag_id', tagIds)

    if (tagError) {
      console.error('[noter-admin] Tag filter query error:', tagError.message)
      throw new Error('查询标签关联失败')
    }

    const docIds = [...new Set((taggedDocs ?? []).map((row) => row.document_id))]

    if (docIds.length === 0) {
      // 没有匹配的文档,直接返回空结果
      return success({ items: [], total: 0 })
    }

    query = query.in('id', docIds)
  }

  // ─── 10. 执行查询 ───
  const { data, count, error: queryError } = await query

  if (queryError) {
    console.error('[noter-admin] Public documents list query error:', queryError.message)
    throw new Error('查询公共文档列表失败')
  }

  const documents = data ?? []

  // ─── 11. 获取每个文档的 latestVersionNo ───
  const versionMap: Record<string, number> = {}
  if (documents.length > 0) {
    const docIds = documents.map((doc) => doc.id)

    const { data: versions, error: versionError } = await adminClient
      .from('public_document_versions')
      .select('document_id, version_no')
      .in('document_id', docIds)
      .order('version_no', { ascending: false })

    if (versionError) {
      console.error('[noter-admin] Version query error:', versionError.message)
      // 版本查询失败不阻塞主流程,latestVersionNo 默认为 null
    } else {
      // 取每个 document_id 的最大 version_no
      for (const row of versions ?? []) {
        if (!(row.document_id in versionMap)) {
          versionMap[row.document_id] = row.version_no
        }
      }
    }
  }

  // ─── 12. 获取每个文档的标签 ───
  const tagsMap: Record<string, Array<{ id: string; name: string }>> = {}
  if (documents.length > 0) {
    const docIds = documents.map((doc) => doc.id)

    const { data: docTags, error: tagsError } = await adminClient
      .from('document_tags')
      .select(
        `
        document_id,
        tags (
          id,
          name
        )
      `
      )
      .in('document_id', docIds)

    if (tagsError) {
      console.error('[noter-admin] Tags query error:', tagsError.message)
      // 标签查询失败不阻塞主流程
    } else {
      for (const row of docTags ?? []) {
        const docId = row.document_id
        const tag = row.tags as unknown as { id: string; name: string } | null
        if (tag) {
          if (!tagsMap[docId]) {
            tagsMap[docId] = []
          }
          tagsMap[docId].push({ id: tag.id, name: tag.name })
        }
      }
    }
  }

  // ─── 13. 格式化响应 ───
  const items = documents.map((doc) => {
    const category = doc.public_categories as unknown as {
      id: string
      name: string
    } | null

    return {
      id: doc.id,
      title: doc.title,
      fileName: doc.file_name,
      fileSize: doc.file_size,
      status: doc.status,
      category: category ? { id: category.id, name: category.name } : null,
      tags: tagsMap[doc.id] ?? [],
      latestVersionNo: versionMap[doc.id] ?? null,
      createdAt: doc.created_at
    }
  })

  return success({ items, total: count ?? 0 })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
