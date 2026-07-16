import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { documentIdSchema } from '@/utils/feature/documents/schemas'

const MAX_COVER_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const BUCKET = 'userResources'

type RouteContext = { params: Promise<{ id: string }> }

/** 上传/更换文档封面 */
export const POST = handler(async (request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  // 验证文档归属
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .maybeSingle()
  if (docError) return error(`查询文档失败: ${docError.message}`, 500)
  if (!doc) return error('文档不存在', 404)

  // 解析文件
  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) return error('请选择封面图片', 400)
  if (!ALLOWED_TYPES.includes(file.type)) {
    return error('仅支持 JPG、PNG、WebP、GIF 格式', 400)
  }
  if (file.size > MAX_COVER_SIZE) return error('封面文件不能超过 5MB', 400)

  // 路径与头像保持一致的扁平结构 {userId}/{docId}.{ext}
  const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const storagePath = `${user.id}/${id}.${fileExt}`
  const fileBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: true
    })
  if (uploadError) return error(`封面上传失败: ${uploadError.message}`, 500)

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const coverUrl = `${urlData.publicUrl}?t=${Date.now()}`

  const { error: updateError } = await supabase
    .from('documents')
    .update({ cover_url: coverUrl, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (updateError) return error(`更新封面失败: ${updateError.message}`, 500)

  return success({ coverUrl }, '封面更新成功')
})

/** 删除自定义封面，恢复默认 */
export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id } = await params
  documentIdSchema.parse({ id })

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return error('未登录', 401)

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, cover_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .maybeSingle()
  if (docError) return error(`查询文档失败: ${docError.message}`, 500)
  if (!doc) return error('文档不存在', 404)

  const coverUrl: string | null = (doc as { cover_url?: string | null }).cover_url ?? null

  // 清理 storage 中的旧文件（容错）
  if (coverUrl) {
    const match = coverUrl.match(/\/userResources\/(.+?)(?:\?|$)/)
    if (match && match[1].startsWith(`${user.id}/`)) {
      await supabase.storage.from(BUCKET).remove([match[1]])
    }
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({ cover_url: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (updateError) return error(`重置封面失败: ${updateError.message}`, 500)

  return success(null, '已恢复默认封面')
})
