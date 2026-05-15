// 文档管理系统类型定义
// 按既有数据库表结构定义，不重新设计数据库

// ===== 状态类型别名 =====

/** 文档整体状态 */
export type DocumentStatus = 'processing' | 'ready' | 'failed'

/** 各处理阶段状态（parse/vector/summary/mindmap） */
export type ProcessingStatus = 'pending' | 'running' | 'success' | 'failed'

/** 内置阅读模板类型 */
export type TemplateType = 'default' | 'academic' | 'compact' | 'card'

// ===== 核心数据接口 =====

/** 文档主表 */
export interface Document {
  id: string
  userId: string
  title: string
  originalFilename: string
  fileExt: string | null
  mimeType: string | null
  fileSize: number | null
  originalBucket: string
  originalStoragePath: string
  status: DocumentStatus
  parseStatus: ProcessingStatus
  vectorStatus: ProcessingStatus
  summaryStatus: ProcessingStatus
  mindmapStatus: ProcessingStatus
  shortDescription: string | null
  wordCount: number
  pageCount: number | null
  language: string | null
  isFavorite: number
  isArchived: number
  deleted: number
  folderId: string | null
  coverUrl: string | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
}

/** 文档内容表 */
export interface DocumentContent {
  id: string
  userId: string
  documentId: string
  markdownContent: string
  outline: OutlineNode[] | null
  metadata: Record<string, unknown> | null
}

/** 文档大纲节点 */
export interface OutlineNode {
  id: string
  level: number
  title: string
  children: OutlineNode[]
}

/** 文档资源表（图片等） */
export interface DocumentAsset {
  id: string
  documentId: string
  bucket: string
  storagePath: string
  publicUrl: string
  originalUrl: string | null
  filename: string | null
  mimeType: string | null
  fileSize: number | null
  width: number | null
  height: number | null
  sortOrder: number
}

/** AI 总结表 */
export interface DocumentSummary {
  id: string
  documentId: string
  summary: string
  keyPoints: string[] | null
  todos: string[] | null
  keywords: string[] | null
  suitableScenarios: Record<string, unknown> | null
  modelName: string | null
  generatedAt: string
}

/** AI 思维导图表 */
export interface DocumentMindmap {
  id: string
  documentId: string
  mindmapJson: MindmapNode
  markdownOutline: string | null
  modelName: string | null
  generatedAt: string
}

/** 思维导图节点 */
export interface MindmapNode {
  id: string
  label: string
  children: MindmapNode[]
}

/** 标签表 */
export interface Tag {
  id: string
  name: string
  color: string | null
  description: string | null
  documentCount?: number
}

/** 文档处理任务表 */
export interface DocumentProcessingJob {
  id: string
  documentId: string
  jobType: 'parse-document' | 'vectorize-document' | 'generate-summary' | 'generate-mindmap'
  status: ProcessingStatus
  errorMessage: string | null
  retryCount: number
  startedAt: string | null
  finishedAt: string | null
}

// ===== 请求/响应类型 =====

/** 文档列表查询参数 */
export interface ListParams {
  page: number
  pageSize: number
  tagIds?: string[]
  folderId?: string
  isFavorite?: number
  isArchived?: number
  orderBy?: 'created_at' | 'title' | 'file_size'
  order?: 'asc' | 'desc'
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 搜索查询参数 */
export interface SearchParams {
  query: string
  limit?: number
}

/** 搜索结果 */
export interface SearchResult {
  documentId: string
  title: string
  matchedContent: string
  score: number
  matchType: 'keyword' | 'vector' | 'hybrid'
}
