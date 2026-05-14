import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

type RouteContext = { params: Promise<{ id: string; tagId: string }> }

/**
 * DELETE /api/documents/[id]/tags/[tagId]
 * 移除文档标签（软删除）
 */
export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id, tagId } = await params

  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 软删除关联记录
  const { error: updateError } = await supabase
    .from('document_tags')
    .update({ deleted: 1 })
    .eq('document_id', id)
    .eq('tag_id', tagId)
    .eq('user_id', user.id)
    .eq('deleted', 0)

  if (updateError) {
    return error(updateError.message, 500)
  }

  return success(null, '标签移除成功')
})
