import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { addTagSchema } from '@/utils/feature/tags/schemas'
import { documentIdSchema } from '@/utils/feature/documents/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/documents/[id]/tags
 * 为文档添加标签
 */
export const POST = handler(async (request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 验证文档存在且属于当前用户
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (docError || !document) {
    return error('文档不存在', 404)
  }

  // 解析请求体
  const body = await request.json()
  const { tagId } = addTagSchema.parse(body)

  // 验证标签存在且属于当前用户
  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .maybeSingle()

  if (tagError || !tag) {
    return error('标签不存在', 404)
  }

  // 查询是否已有关联记录（包含已软删除的）
  const { data: existing } = await supabase
    .from('document_tags')
    .select('id, deleted')
    .eq('document_id', id)
    .eq('tag_id', tagId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    if (existing.deleted === 0) {
      return error('标签已关联', 400)
    }
    // 复用已软删除的关联：恢复
    const { error: updateError } = await supabase
      .from('document_tags')
      .update({ deleted: 0 })
      .eq('id', existing.id)

    if (updateError) {
      return error(updateError.message, 500)
    }

    return success(null, '标签添加成功')
  }

  // 插入关联记录
  const { error: insertError } = await supabase.from('document_tags').insert({
    user_id: user.id,
    document_id: id,
    tag_id: tagId,
    deleted: 0
  })

  if (insertError) {
    return error(insertError.message, 500)
  }

  return success(null, '标签添加成功')
})
