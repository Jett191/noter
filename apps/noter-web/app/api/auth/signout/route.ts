import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { success, error } from '@/utils/noterFetch/http/response'

// 退出登录 API
export const POST = handler(async () => {
  const supabase = await createClient()

  const { error: authError } = await supabase.auth.signOut()

  if (authError) {
    return error(authError.message, 400)
  }

  return success(null, '退出登录成功')
})
