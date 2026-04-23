import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { error } from '@/utils/noterFetch/http/response'

// GitHub OAuth 登录 — 生成授权 URL 并重定向
export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  // 构建回调地址，指向 /callback 页面
  const origin = request.headers.get('origin') || ''
  const redirectTo = `${origin}/callback?provider=github`

  const { data, error: authError } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo
    }
  })

  if (authError || !data.url) {
    return error(authError?.message || 'GitHub 授权失败', 400)
  }

  // 返回授权 URL，前端进行跳转
  return Response.json({ code: 200, message: 'success', data: { url: data.url } }, { status: 200 })
})
