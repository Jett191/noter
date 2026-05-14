import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

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

export const PATCH = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const body = await request.json()
  const { username } = body as { username?: string }

  const metadata: Record<string, unknown> = {}
  if (username !== undefined) {
    metadata.username = username
  }

  const { error: updateError } = await supabase.auth.updateUser({
    data: metadata
  })

  if (updateError) {
    return error(`更新失败: ${updateError.message}`, 500)
  }

  // 重新获取用户信息
  const {
    data: { user: updatedUser }
  } = await supabase.auth.getUser()

  return success(
    {
      id: updatedUser!.id,
      email: updatedUser!.email ?? '',
      username: updatedUser!.user_metadata.username ?? '',
      avatarUrl: updatedUser!.user_metadata.avatar_url ?? null
    },
    '更新成功'
  )
})
