import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { signUpSchema } from '@/utils/feature/auth/schmas'

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
