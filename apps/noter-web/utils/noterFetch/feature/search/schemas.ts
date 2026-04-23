import { z } from 'zod'

// 搜索校验
export const searchSchema = z.object({
  q: z.string().min(1, '搜索关键词不能为空').max(200, '搜索关键词不能超过 200 字'),
  mode: z.enum(['keyword', 'semantic', 'hybrid']).default('hybrid'),
  page: z.coerce.number().int().min(1, '页码最小为 1').default(1),
  pageSize: z.coerce.number().int().min(1).max(50, '每页最多 50 条').default(20)
})
export type SearchInput = z.infer<typeof searchSchema>
