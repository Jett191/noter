import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { success, error } from '@/utils/noterFetch/http/response'

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
