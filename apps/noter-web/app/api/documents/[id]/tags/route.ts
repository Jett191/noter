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

  // 检查标签是否已关联
  const { data: existing } = await supabase
    .from('document_tags')
    .select('id')
    .eq('document_id', id)
    .eq('tag_id', tagId)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (existing) {
    return error('标签已关联', 400)
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
