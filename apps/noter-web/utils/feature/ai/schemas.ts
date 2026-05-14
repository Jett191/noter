import { z } from 'zod'

export const regenerateSchema = z.object({
  documentId: z.string().uuid('documentId 必须是有效的 UUID')
})
export type RegenerateInput = z.infer<typeof regenerateSchema>
