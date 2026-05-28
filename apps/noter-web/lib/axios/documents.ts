import { http } from './client'
import type { Document, ListParams, PaginatedResult } from '@/types/document'

interface DocumentStatusResponse {
  status: string
  parseStatus: string
  vectorStatus: string
  summaryStatus: string
  mindmapStatus: string
}

export const documentApi = {
  /** 上传文档 */
  upload: (formData: FormData) =>
    http.post<Document>('api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  /** 获取文档列表（分页 + 标签筛选）
   *  使用 `paramsSerializer.indexes = null` 让数组序列化为 `tagIds=a&tagIds=b`
   *  （而不是 axios 默认的 `tagIds[]=a&tagIds[]=b`），以匹配后端的 `searchParams.getAll('tagIds')`
   */
  list: (params: ListParams) =>
    http.get<PaginatedResult<Document>>(
      'api/documents',
      params as unknown as Record<string, unknown>,
      { paramsSerializer: { indexes: null } }
    ),

  /** 获取文档详情 */
  getById: (id: string) => http.get<Document>(`api/documents/${id}`),

  /** 删除文档（软删除） */
  delete: (id: string) => http.delete<void>(`api/documents/${id}`),

  /** 查询文档处理状态（用于轮询） */
  getStatus: (id: string) => http.get<DocumentStatusResponse>(`api/documents/${id}/status`),

  /** 上传/更换文档封面 */
  uploadCover: (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return http.post<{ coverUrl: string }>(`api/documents/${id}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  /** 删除自定义封面，恢复默认 */
  resetCover: (id: string) => http.delete<void>(`api/documents/${id}/cover`)
}
