import { z } from 'zod'

export const signUpSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确'),
  password: z.string().trim().min(6, '密码至少 6 位'),
  username: z.string().trim().min(2, '用户名至少 2 位')
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const emailConfirmSchema = z.object({
  type: z.enum(['email', 'signup', 'invite', 'recovery', 'email_change']),
  token_hash: z.string().min(1, 'token_hash 缺失')
})
export type EmailConfirmInput = z.infer<typeof emailConfirmSchema>
