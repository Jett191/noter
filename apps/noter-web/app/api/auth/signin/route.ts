import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { success, error } from '@/utils/noterFetch/http/response'
import { signInSchema } from '@/utils/noterFetch/feature/auth/schmas'

export const POST = handler(async (request: Request) => {
  const body = signInSchema.parse(await request.json())
  console.log('Login attempt:', body)
  const supabase = await createClient()

  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password
  })

  if (authError) {
    return error(authError.message, 400)
  }

  return success(data, '登录成功')
})
