import 'server-only'

/**
 * GET /api/admin/dashboard/distributions
 *
 * 文档状态分布 + 公共标签 top 10。
 *
 * 设计参见 design.md §6.4 (Dashboard) 与 Requirements 6:
 *   - 受 requireAdmin() 保护
 *   - 文档状态分布:processing / ready / failed 各自的文档数(deleted=0）
 *   - 公共标签 top 10:按关联文档数降序,取前 10 个 is_official=true 的标签
 *   - 返回 { documentStatus: [...], topTags: [...] }
 */

import { withRouteHandler } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  const adminClient = getSupabaseAdmin()

  // ─── 2. 并发查询文档状态分布 + 公共标签 top 10 ───
  const [processingRes, readyRes, failedRes, tagsRes] = await Promise.all([
    // processing 文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', 0)
      .eq('status', 'processing'),

    // ready 文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', 0)
      .eq('status', 'ready'),

    // failed 文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', 0)
      .eq('status', 'failed'),

    // 公共标签 top 10:查询 tags + document_tags 关联计数
    adminClient
      .from('tags')
      .select('id, name, document_tags(count)', { count: 'exact' })
      .eq('is_official', true)
      .eq('deleted', 0)
      .limit(10)
  ])

  // ─── 3. 文档状态分布 ───
  const documentStatus = [
    { status: 'processing', count: processingRes.count ?? 0 },
    { status: 'ready', count: readyRes.count ?? 0 },
    { status: 'failed', count: failedRes.count ?? 0 }
  ]

  // ─── 4. 公共标签 top 10 ───
  // Supabase 嵌套 count 返回格式: document_tags: [{ count: N }]
  const tagsData = (tagsRes.data ?? []) as Array<{
    id: string
    name: string
    document_tags: Array<{ count: number }>
  }>

  const topTags = tagsData
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      documentCount: tag.document_tags?.[0]?.count ?? 0
    }))
    .sort((a, b) => b.documentCount - a.documentCount)
    .slice(0, 10)

  return success({ documentStatus, topTags })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
