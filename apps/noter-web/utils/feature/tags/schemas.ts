import { z } from 'zod'

export const createTagSchema = z.object({
  name: z.string().trim().min(1, '标签名称不能为空').max(20, '标签名称不能超过 20 个字符')
})
export type CreateTagInput = z.infer<typeof createTagSchema>

export const tagIdSchema = z.object({
  id: z.string().uuid('标签 ID 格式不正确')
})
export type TagIdInput = z.infer<typeof tagIdSchema>

export const addTagSchema = z.object({
  tagId: z.string().uuid('标签 ID 格式不正确')
})
export type AddTagInput = z.infer<typeof addTagSchema>
