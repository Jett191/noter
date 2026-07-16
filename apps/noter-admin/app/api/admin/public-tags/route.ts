import 'server-only'

/**
 * GET  /api/admin/public-tags — 列表 + 关联公共文档数
 * POST /api/admin/public-tags — 新建公共标签,is_official=true 范围内 name 唯一,写 audit log
 *
 * 设计参见 design.md §6.3 (分类与标签) 与 Requirements 21:
 *   - 受 requireAdmin() 保护
 *   - 公共标签 = tags 表 WHERE is_official=true AND deleted=0
 *   - GET: 返回所有公共标签,附带关联公共文档数
 *   - POST: 新建标签(is_official=true),name 在 is_official=true AND deleted=0 范围内唯一
 *     (数据库 partial unique index tags_official_name_uniq 保证),捕获 23505 → 409
 */

import { withRouteHandler, ValidationError, ConflictError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

// ─── GET: 列表 + 关联公共文档数 ───

async function getHandler(request: Request): Promise<Response> {
  await requireAdmin()

  const adminClient = getSupabaseAdmin()

  // 查询所有公共标签(is_official=true AND deleted=0)
  const { data: tags, error: tagError } = await adminClient
    .from('tags')
    .select('id, name, created_at, updated_at')
    .eq('is_official', true)
    .eq('deleted', 0)
    .order('created_at', { ascending: false })

  if (tagError) {
    throw new Error(`查询公共标签列表失败: ${tagError.message}`)
  }

  // 聚合每个标签关联的公共文档数
  const tagIds = (tags ?? []).map((t) => t.id)

  let documentCounts: Record<string, number> = {}

  if (tagIds.length > 0) {
    // 查询 document_tags 关联,JOIN documents 确保只统计公共文档
    const { data: tagDocs, error: countError } = await adminClient
      .from('document_tags')
      .select('tag_id, documents!inner(id, document_scope, deleted)')
      .in('tag_id', tagIds)
      .eq('documents.document_scope', 'public')
      .eq('documents.deleted', 0)

    if (!countError && tagDocs) {
      documentCounts = tagDocs.reduce(
        (acc, row) => {
          const tagId = (row as { tag_id: string }).tag_id
          acc[tagId] = (acc[tagId] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
    }
  }

  const items = (tags ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
    documentCount: documentCounts[tag.id] || 0
  }))

  return success({ items })
}

// ─── POST: 新建公共标签 ───

interface CreateTagBody {
  name: string
}

async function postHandler(request: Request): Promise<Response> {
  const admin = await requireAdmin()

  // 解析请求体
  const body = (await request.json()) as CreateTagBody

  // 参数校验
  if (!body.name || !body.name.trim()) {
    throw new ValidationError('name 不能为空')
  }

  const adminClient = getSupabaseAdmin()

  // 插入标签(is_official=true),唯一约束由数据库 partial unique index 保证
  const { data: created, error: insertError } = await adminClient
    .from('tags')
    .insert({
      name: body.name.trim(),
      is_official: true
    })
    .select('id, name, created_at, updated_at')
    .single()

  if (insertError) {
    // 23505 = unique_violation
    if ((insertError as { code?: string }).code === '23505') {
      throw new ConflictError('公共标签名称已存在')
    }
    throw new Error(`创建公共标签失败: ${insertError.message}`)
  }

  // 写 audit log
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_tag.create',
    targetResourceType: 'public_tag',
    targetResourceId: created.id,
    targetResourceLabel: created.name,
    metadata: {},
    request
  })

  return success(
    {
      id: created.id,
      name: created.name,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    },
    201
  )
}

export const GET = withRouteHandler(getHandler, { timeoutMs: 10_000 })
export const POST = withRouteHandler(postHandler, { timeoutMs: 10_000 })
