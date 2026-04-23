import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { success, error } from '@/utils/noterFetch/http/response'
import { updateProfileSchema } from '@/utils/noterFetch/feature/auth/schmas'

export const GET = handler(async () => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  return success(
    {
      id: user.id,
      email: user.email ?? '',
      username: user.user_metadata.username ?? '',
      avatarUrl: user.user_metadata.avatar_url ?? null
    },
    '获取用户信息成功'
  )
})

// 更新用户信息
export const PATCH = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const body = await request.json()
  const parsed = updateProfileSchema.parse(body)

  // 至少需要提供一个更新字段
  if (!parsed.username && !parsed.avatar_url) {
    return error('请提供需要更新的字段', 400)
  }

  // 构建更新数据
  const updateData: Record<string, string> = {}
  if (parsed.username) updateData.username = parsed.username
  if (parsed.avatar_url) updateData.avatar_url = parsed.avatar_url

  // 更新 profiles 表
  const { data, error: dbError } = await supabase
    .from('profiles')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)
    .select()
    .single()

  if (dbError) {
    return error('更新用户信息失败', 500)
  }

  return success(
    {
      id: data.id,
      email: data.email,
      username: data.username,
      avatarUrl: data.avatar_url ?? null
    },
    '更新用户信息成功'
  )
})
