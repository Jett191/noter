export interface Folder {
  id: string
  userId: string
  name: string
  parentId: string | null
  icon: string | null
  sortOrder: number
  deleted: number
  createdAt: string
  updatedAt: string
  documentCount?: number
  children?: Folder[]
}
