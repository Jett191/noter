import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

export const POST = handler(async () => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const { error: signOutError } = await supabase.auth.signOut()

  if (signOutError) {
    return error(signOutError.message, 500)
  }

  return success(null, '退出登录成功')
})
