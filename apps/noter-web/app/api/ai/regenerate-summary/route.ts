import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { regenerateSchema } from '@/utils/feature/ai/schemas'

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const body = await request.json()
  const { documentId } = regenerateSchema.parse(body)

  // 验证文档存在且属于当前用户
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (docError || !document) {
    return error('文档不存在', 404)
  }

  // 更新 summary_status 为 pending
  const { error: updateError } = await supabase
    .from('documents')
    .update({ summary_status: 'pending' })
    .eq('id', documentId)

  if (updateError) {
    return error('更新状态失败', 500)
  }

  // 触发 generate-summary Edge Function（fire and forget）
  supabase.functions.invoke('generate-summary', {
    body: { documentId, userId: user.id }
  })

  return success({ message: '重新生成已触发' })
})
