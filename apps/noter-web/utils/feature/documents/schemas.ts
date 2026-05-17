import { z } from 'zod'

// UUID 正则
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 支持的文件扩展名
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md'] as const

// 文件大小上限：50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * 文档列表查询参数 Schema
 * 用于 GET /api/documents 分页 + 标签 / 元数据筛选 + 排序
 */
export const listDocumentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .refine((v) => [10, 20, 50].includes(v), {
      message: '每页条数仅支持 10、20、50'
    })
    .default(10),
  tagIds: z.array(z.string().regex(uuidRegex, '标签 ID 格式不正确')).optional(),
  /** 文档整体状态：ready / processing / failed */
  status: z.enum(['ready', 'processing', 'failed']).optional(),
  /** 是否收藏：0/1 */
  isFavorite: z.coerce.number().int().min(0).max(1).optional(),
  /** 是否归档：0/1 */
  isArchived: z.coerce.number().int().min(0).max(1).optional(),
  /** 文件扩展名（多选 OR），与 ALLOWED_EXTENSIONS 对齐 */
  fileExts: z.array(z.enum(ALLOWED_EXTENSIONS)).optional(),
  /** 创建时间范围（ISO 字符串） */
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  orderBy: z
    .enum(['created_at', 'updated_at', 'title', 'file_size', 'word_count'])
    .default('created_at')
    .optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional()
})
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>

/**
 * 文档 ID 参数 Schema
 * 用于 GET/DELETE /api/documents/[id] 等需要文档 ID 的接口
 */
export const documentIdSchema = z.object({
  id: z.string().regex(uuidRegex, '文档 ID 格式不正确')
})
export type DocumentIdInput = z.infer<typeof documentIdSchema>

/**
 * 文档上传校验 Schema
 * 校验文件扩展名和文件大小
 */
export const uploadDocumentSchema = z.object({
  fileName: z
    .string()
    .min(1, '文件名不能为空')
    .refine(
      (name) => {
        const ext = name.split('.').pop()?.toLowerCase()
        return (
          ext !== undefined &&
          ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])
        )
      },
      {
        message: `仅支持以下文件格式: ${ALLOWED_EXTENSIONS.join(', ')}`
      }
    ),
  fileSize: z.number().positive('文件大小必须大于 0').max(MAX_FILE_SIZE, '文件大小不能超过 50MB')
})
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>

export { ALLOWED_EXTENSIONS, MAX_FILE_SIZE }
