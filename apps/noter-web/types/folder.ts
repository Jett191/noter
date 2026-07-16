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
  /**
   * 标记是否为系统文件夹 (admin-platform / Requirements 12)。
   * true: 由 noter-admin 管理的「Noter 官方」文件夹,前端展示为只读,
   *       不允许重命名 / 删除 / 移动 / 在其下新建子文件夹或上传文档。
   */
  isSystemFolder?: boolean
  children?: Folder[]
}
