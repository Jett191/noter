import { z } from 'zod'

// 创建标注/笔记校验
export const createAnnotationSchema = z.object({
  documentId: z.string().uuid('文档 ID 格式不正确'),
  snapshotId: z.string().uuid('快照 ID 格式不正确'),
  annotationType: z.enum(['underline', 'highlight', 'note'], {
    errorMap: () => ({ message: '标注类型只能为 underline、highlight 或 note' })
  }),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色格式不正确')
    .optional(),
  anchor: z.object({
    blockId: z.string().uuid('块 ID 格式不正确'),
    charStart: z.number().int().min(0, '字符起始位置不能为负数'),
    charEnd: z.number().int().min(0, '字符结束位置不能为负数')
  }),
  selectedText: z.string().min(1, '选中文本不能为空'),
  prefixText: z.string().optional(),
  suffixText: z.string().optional(),
  content: z.string().optional()
})
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>

// 更新笔记内容校验
export const updateAnnotationSchema = z.object({
  content: z.string().min(1, '笔记内容不能为空')
})
export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>
