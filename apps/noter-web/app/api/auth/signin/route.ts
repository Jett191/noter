import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { signInSchema } from '@/utils/feature/auth/schmas'

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
