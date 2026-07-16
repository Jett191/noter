import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

type RouteContext = { params: Promise<{ id: string; tagId: string }> }

/**
 * DELETE /api/documents/[id]/tags/[tagId]
 * 移除文档与标签的关联（document_tags 用真删除）
 *
 * 级联策略：
 * - 默认只解除当前文档与该标签的关联，标签实体保留，筛选面板仍可见
 * - 若该文档是最后一个使用该标签的文档（解除后再无任何 document_tags 引用）
 *   则同时软删除标签实体（tags.deleted = 1），筛选面板同步消失
 *
 * 注意：document_tags 表的 RLS 仅有 SELECT/INSERT/DELETE，没有 UPDATE 策略，
 * 因此关联记录必须真删除。
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

  // 1. 解除当前文档与该标签的关联
  const { error: deleteError } = await supabase
    .from('document_tags')
    .delete()
    .eq('document_id', id)
    .eq('tag_id', tagId)
    .eq('user_id', user.id)

  if (deleteError) {
    return error(deleteError.message, 500)
  }

  // 2. 检查标签是否还被其他文档使用
  const { count: remainingCount, error: countError } = await supabase
    .from('document_tags')
    .select('id', { count: 'exact', head: true })
    .eq('tag_id', tagId)
    .eq('user_id', user.id)

  if (countError) {
    return error(countError.message, 500)
  }

  let tagDeleted = false

  // 3. 若不再有任何文档使用 → 软删除标签实体
  if ((remainingCount ?? 0) === 0) {
    const { error: tagDeleteError } = await supabase
      .from('tags')
      .update({ deleted: 1 })
      .eq('id', tagId)
      .eq('user_id', user.id)
      .eq('deleted', 0)

    if (tagDeleteError) {
      return error(tagDeleteError.message, 500)
    }
    tagDeleted = true
  }

  return success({ tagDeleted }, '标签移除成功')
})
