// 搜索模块类型定义

// 搜索模式
export type SearchMode = 'keyword' | 'semantic' | 'hybrid'

// 搜索结果
export interface SearchResult {
  documentId: string
  documentTitle: string
  chunkId: string
  snippet: string
  highlightedSnippet: string
  pageNo: number
  score: number
}

// 搜索参数
export interface SearchParams {
  q: string
  mode: SearchMode
  page: number
  pageSize: number
}
