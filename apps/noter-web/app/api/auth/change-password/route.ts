import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { z } from 'zod'

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(6, '新密码至少 6 个字符')
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
  const { oldPassword, newPassword } = changePasswordSchema.parse(body)

  // 验证旧密码：尝试用旧密码重新登录
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: oldPassword
  })

  if (signInError) {
    return error('当前密码不正确', 400)
  }

  // 更新密码
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (updateError) {
    return error(`密码修改失败: ${updateError.message}`, 500)
  }

  return success(null, '密码修改成功')
})
