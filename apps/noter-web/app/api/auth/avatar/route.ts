import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return error('请选择头像文件', 400)
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return error('仅支持 JPG、PNG、WebP、GIF 格式', 400)
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return error('头像文件不能超过 5MB', 400)
  }

  // 生成存储路径
  const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const storagePath = `${user.id}/avatar.${fileExt}`

  const fileBuffer = await file.arrayBuffer()

  // 上传到 userResources bucket
  const { error: uploadError } = await supabase.storage
    .from('userResources')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: true // 覆盖旧头像
    })

  if (uploadError) {
    return error(`头像上传失败: ${uploadError.message}`, 500)
  }

  // 获取公开 URL
  const { data: urlData } = supabase.storage.from('userResources').getPublicUrl(storagePath)

  const avatarUrl = urlData.publicUrl

  // 更新用户 metadata
  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl }
  })

  if (updateError) {
    return error(`更新头像信息失败: ${updateError.message}`, 500)
  }

  return success(
    {
      id: user.id,
      email: user.email ?? '',
      username: user.user_metadata.username ?? '',
      avatarUrl
    },
    '头像上传成功'
  )
})
