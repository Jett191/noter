// 文档相关类型定义

// 文档来源类型
export type DocumentSourceType = 'pdf' | 'markdown' | 'docx'

// 文档处理状态
export type DocumentStatus = 'uploaded' | 'parsing' | 'indexed' | 'failed' | 'ready'

// 文档可见性
export type DocumentVisibility = 'private' | 'shared'

// 渲染块类型
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'quote'
  | 'code'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'image'
  | 'divider'

// 文档主表
export interface Document {
  id: string
  ownerId: string
  latestSnapshotId: string | null
  description: string | null
  sourceType: DocumentSourceType
  originalFilename: string
  mimeType: string | null
  fileSize: number | null
  storageBucket: string
  storagePath: string
  checksum: string | null
  status: DocumentStatus
  visibility: DocumentVisibility
  createdAt: string
  updatedAt: string
}

// 文档快照
export interface DocumentSnapshot {
  id: string
  documentId: string
  version: number
  parserVersion: string | null
  renderFormat: string
  contentJson: Record<string, unknown> | null
  plainText: string | null
  pageCount: number | null
  wordCount: number | null
  createdAt: string
}

// 文档渲染块
export interface DocumentBlock {
  id: string
  snapshotId: string
  pageNo: number | null
  blockOrder: number
  blockType: BlockType
  textContent: string
  attrs: Record<string, unknown>
  charStart: number | null
  charEnd: number | null
  createdAt: string
}

// 文档检索分片
export interface DocumentChunk {
  id: string
  snapshotId: string
  blockStartId: string | null
  blockEndId: string | null
  chunkOrder: number
  textContent: string
  tokenCount: number | null
  startOffsetInBlock: number | null
  endOffsetInBlock: number | null
  pageFrom: number | null
  pageTo: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

// 分页参数
export interface ListParams {
  page?: number
  pageSize?: number
}

// 渲染块查询参数
export interface BlockParams extends ListParams {
  pageNo?: number
}

// 分页响应
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
