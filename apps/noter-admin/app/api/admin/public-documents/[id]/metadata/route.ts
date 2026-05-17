import 'server-only'

/**
 * PATCH /api/admin/public-documents/[id]/metadata
 *
 * 公共文档元数据更新接口:修改标题/简介/语言/分类/标签,不创建版本。
 *
 * 设计参见 design.md §6.2:
 *   - 受 requireAdmin() 保护
 *   - body: { title?, shortDescription?, language?, publicCategoryId?, tagIds? }
 *   - 校验 tagIds 全部 is_official=true;否则 400
 *   - 事务:DELETE 现有 document_tags → INSERT 新 document_tags
 *   - UPDATE documents 字段(title, short_description, language, public_category_id)
 *   - 不创建版本(仅元数据变更)
 *   - 写 audit_log: public_document.metadata_update
 */

import { withRouteHandler, NotFoundError, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

interface MetadataUpdateBody {
  title?: string
  shortDescription?: string
  language?: string
  publicCategoryId?: string | null
  tagIds?: string[]
}

async function handler(request: Request, ctx?: unknown): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 获取路由参数 ───
  const { params } = ctx as { params: Promise<{ id: string }> }
  const { id: documentId } = await params

  // ─── 3. 解析请求体 ───
  const body = (await request.json()) as MetadataUpdateBody

  // ─── 4. 校验文档存在且为 public scope ───
  const adminClient = getSupabaseAdmin()

  const { data: document, error: docError } = await adminClient
    .from('documents')
    .select('id, title, document_scope')
    .eq('id', documentId)
    .eq('document_scope', 'public')
    .single()

  if (docError || !document) {
    throw new NotFoundError('document_not_found')
  }

  // ─── 5. 校验 tagIds 全部 is_official=true ───
  if (body.tagIds && body.tagIds.length > 0) {
    const { data: tags, error: tagsError } = await adminClient
      .from('tags')
      .select('id, is_official')
      .in('id', body.tagIds)

    if (tagsError) {
      throw new ValidationError('failed_to_validate_tags')
    }

    // 检查是否所有 tagIds 都存在
    if (!tags || tags.length !== body.tagIds.length) {
      throw new ValidationError('some_tags_not_found')
    }

    // 检查是否所有 tag 都是 is_official=true
    const nonOfficialTags = tags.filter(
      (t) => !(t as { id: string; is_official: boolean }).is_official
    )
    if (nonOfficialTags.length > 0) {
      throw new ValidationError('tags_must_be_official', {
        nonOfficialTagIds: nonOfficialTags.map((t) => (t as { id: string }).id)
      })
    }
  }

  // ─── 6. 事务:重写 document_tags 关联 ───
  if (body.tagIds !== undefined) {
    // DELETE 现有 document_tags
    const { error: deleteError } = await adminClient
      .from('document_tags')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) {
      throw new ValidationError('failed_to_update_tags')
    }

    // INSERT 新 document_tags
    if (body.tagIds.length > 0) {
      const tagRows = body.tagIds.map((tagId) => ({
        document_id: documentId,
        tag_id: tagId
      }))

      const { error: insertError } = await adminClient.from('document_tags').insert(tagRows)

      if (insertError) {
        throw new ValidationError('failed_to_insert_tags')
      }
    }
  }

  // ─── 7. UPDATE documents 字段 ───
  const updateFields: Record<string, unknown> = {}

  if (body.title !== undefined) {
    updateFields.title = body.title
  }
  if (body.shortDescription !== undefined) {
    updateFields.short_description = body.shortDescription
  }
  if (body.language !== undefined) {
    updateFields.language = body.language
  }
  if (body.publicCategoryId !== undefined) {
    updateFields.public_category_id = body.publicCategoryId
  }

  if (Object.keys(updateFields).length > 0) {
    updateFields.updated_at = new Date().toISOString()

    const { error: updateError } = await adminClient
      .from('documents')
      .update(updateFields)
      .eq('id', documentId)

    if (updateError) {
      throw new ValidationError('failed_to_update_document')
    }
  }

  // ─── 8. 写 audit log ───
  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'public_document.metadata_update',
    targetResourceType: 'public_document',
    targetResourceId: documentId,
    targetResourceLabel: body.title ?? document.title,
    metadata: {
      updatedFields: Object.keys(updateFields).filter((k) => k !== 'updated_at'),
      tagIds: body.tagIds ?? undefined
    },
    request
  })

  // ─── 9. 返回成功响应 ───
  return success({ id: documentId, updated: true })
}

export const PATCH = withRouteHandler(handler, { timeoutMs: 15_000 })
