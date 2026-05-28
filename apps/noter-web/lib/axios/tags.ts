import { http } from './client'
import type { Tag } from '@/types/document'

export const tagApi = {
  /** 获取当前用户的所有标签列表 */
  list: () => http.get<Tag[]>('api/tags'),

  /** 创建新标签 */
  create: (data: { name: string }) => http.post<Tag>('api/tags', data),

  /** 删除标签 */
  delete: (id: string) => http.delete<void>(`api/tags/${id}`),

  /** 为文档添加标签 */
  addToDocument: (documentId: string, tagId: string) =>
    http.post<void>(`api/documents/${documentId}/tags`, { tagId }),

  /** 移除文档标签
   *  返回 { tagDeleted: boolean }，true 表示该标签已被级联软删除（无任何文档再使用）
   */
  removeFromDocument: (documentId: string, tagId: string) =>
    http.delete<{ tagDeleted: boolean }>(`api/documents/${documentId}/tags/${tagId}`)
}
