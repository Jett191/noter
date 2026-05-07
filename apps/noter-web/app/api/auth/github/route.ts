import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()
  const { origin } = new URL(request.url)

  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${origin}/api/auth/callback`
    }
  })

  if (oauthError) {
    return error(oauthError.message, 400)
  }

  return success({ url: data.url }, 'GitHub OAuth URL 获取成功')
})
