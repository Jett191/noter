import { z } from 'zod'

// 文档上传校验
export const uploadSchema = z.object({
  description: z.string().max(500, '描述不能超过 500 字').optional()
})
export type UploadInput = z.infer<typeof uploadSchema>

// 文档描述更新校验
export const updateDocSchema = z.object({
  description: z.string().max(500, '描述不能超过 500 字').optional()
})
export type UpdateDocInput = z.infer<typeof updateDocSchema>

// 文档可见性校验
export const visibilitySchema = z.object({
  visibility: z.enum(['private', 'shared'], {
    errorMap: () => ({ message: '可见性只能为 private 或 shared' })
  })
})
export type VisibilityInput = z.infer<typeof visibilitySchema>
