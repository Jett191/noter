// 标注与笔记类型定义

// 标注类型
export type AnnotationType = 'underline' | 'highlight' | 'note'

// 锚定信息
export interface Anchor {
  blockId: string
  charStart: number
  charEnd: number
}

// 标注/笔记
export interface Annotation {
  id: string
  userId: string
  documentId: string
  snapshotId: string
  annotationType: AnnotationType
  color: string | null
  anchor: Anchor
  selectedText: string
  prefixText: string
  suffixText: string
  content: string | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

// 创建标注请求
export interface CreateAnnotationInput {
  documentId: string
  snapshotId: string
  annotationType: AnnotationType
  color?: string
  anchor: Anchor
  selectedText: string
  prefixText?: string
  suffixText?: string
  content?: string
}

// 更新笔记请求
export interface UpdateAnnotationInput {
  content: string
}
