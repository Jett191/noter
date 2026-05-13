import { z } from 'zod'

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, '文件夹名称不能为空').max(50, '文件夹名称不能超过50个字符'),
  parentId: z.string().uuid().optional(),
})
export type CreateFolderInput = z.infer<typeof createFolderSchema>

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  parentId: z.string().uuid().nullable().optional(),
})
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>

export const folderIdSchema = z.object({
  id: z.string().uuid('文件夹 ID 格式不正确'),
})
export type FolderIdInput = z.infer<typeof folderIdSchema>
