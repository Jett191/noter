import { http } from './client'
import type { Folder } from '@/types/folder'

export const folderApi = {
  list: () => http.get<Folder[]>('api/folders'),

  create: (data: { name: string; parentId?: string }) => http.post<Folder>('api/folders', data),

  update: (id: string, data: { name?: string; parentId?: string | null }) =>
    http.patch<void>(`api/folders/${id}`, data),

  delete: (id: string) => http.delete<void>(`api/folders/${id}`)
}
