import { z } from 'zod'

export const searchSchema = z.object({
  query: z.string().trim().min(1, '搜索关键词不能为空').max(200, '搜索关键词不能超过 200 个字符'),
  limit: z.coerce.number().int().min(1).max(50).default(20).optional()
})
export type SearchInput = z.infer<typeof searchSchema>
