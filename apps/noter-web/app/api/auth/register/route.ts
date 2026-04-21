import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/noterFetch/http/handler'
import { success, error } from '@/utils/noterFetch/http/response'
import { signUpSchema } from '@/utils/noterFetch/feature/auth/schmas'

export const POST = handler(async (request: Request) => {
  const body = signUpSchema.parse(await request.json())
  const supabase = await createClient()

  const { data, error: authError } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      data: {
        username: body.username
      }
    }
  })

  if (authError) {
    return error(authError.message, 400)
  }

  return success(data, '注册成功')
})
