import { http } from './client'
import type { SearchResult, SearchParams } from '@/types/document'

export const searchApi = {
  /** 混合搜索文档（向量 + 关键词），10 秒超时 */
  search: (params: SearchParams) =>
    http.get<SearchResult[]>('api/search', { ...params } as Record<string, unknown>, {
      timeout: 10000
    })
}
