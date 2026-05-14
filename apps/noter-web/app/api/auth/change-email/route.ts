import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { z } from 'zod'

const changeEmailSchema = z.object({
  newEmail: z.string().email('请输入有效的邮箱地址')
})

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  const body = await request.json()
  const { newEmail } = changeEmailSchema.parse(body)

  if (newEmail === user.email) {
    return error('新邮箱与当前邮箱相同', 400)
  }

  // Supabase 会发送确认邮件到新邮箱
  const { error: updateError } = await supabase.auth.updateUser({
    email: newEmail
  })

  if (updateError) {
    return error(`邮箱修改失败: ${updateError.message}`, 500)
  }

  return success(null, '确认邮件已发送到新邮箱，请查收确认')
})
