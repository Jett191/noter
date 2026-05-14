import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { tagIdSchema } from '@/utils/feature/tags/schemas'

export const DELETE = handler(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return error('未登录', 401)
    }

    // 验证参数
    const { id } = params ? tagIdSchema.parse(await params) : { id: '' }

    // 软删除标签
    const { error: updateError, count } = await supabase
      .from('tags')
      .update({ deleted: 1 })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('deleted', 0)

    if (updateError) {
      return error(updateError.message, 500)
    }

    if (count === 0) {
      return error('标签不存在', 404)
    }

    // 解除文档关联（软删除 document_tags 中的关联记录）
    const { error: unlinkError } = await supabase
      .from('document_tags')
      .update({ deleted: 1 })
      .eq('tag_id', id)
      .eq('user_id', user.id)
      .eq('deleted', 0)

    if (unlinkError) {
      return error(unlinkError.message, 500)
    }

    return success(null, '删除标签成功')
  }
)
