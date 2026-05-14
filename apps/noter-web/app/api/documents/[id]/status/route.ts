import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { documentIdSchema } from '@/utils/feature/documents/schemas'

export const GET = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 从 URL 路径中提取文档 ID
  const url = new URL(request.url)
  const segments = url.pathname.split('/')
  // URL 格式: /api/documents/[id]/status
  const idIndex = segments.indexOf('documents') + 1
  const id = segments[idIndex]

  // 校验文档 ID 格式
  const { id: documentId } = documentIdSchema.parse({ id })

  // 查询文档状态字段
  const { data: document, error: dbError } = await supabase
    .from('documents')
    .select('status, parse_status, vector_status, summary_status, mindmap_status')
    .eq('id', documentId)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .single()

  if (dbError || !document) {
    return error('文档不存在', 404)
  }

  return success({
    status: document.status,
    parseStatus: document.parse_status,
    vectorStatus: document.vector_status,
    summaryStatus: document.summary_status,
    mindmapStatus: document.mindmap_status
  })
})
