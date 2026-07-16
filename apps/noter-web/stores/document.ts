import { create } from 'zustand'
import { documentApi } from '@/lib/axios/documents'
import { useFolderStore } from '@/stores/folders'
import type { Document, ListParams } from '@/types/document'

export type SortField = NonNullable<ListParams['orderBy']>
export type SortOrder = NonNullable<ListParams['order']>
export type StatusFilter = NonNullable<ListParams['status']>

export interface DocumentFilters {
  /** 整体状态：ready / processing / failed */
  status: StatusFilter | null
  /** 是否仅看收藏 */
  favoriteOnly: boolean
  /** 文件扩展名（多选 OR） */
  fileExts: string[]
  /** 创建时间范围：以"近 N 天"表达，发请求时转换为 ISO；null 表示不限 */
  createdWithinDays: number | null
}

const DEFAULT_FILTERS: DocumentFilters = {
  status: null,
  favoriteOnly: false,
  fileExts: [],
  createdWithinDays: null
}

interface DocumentState {
  documents: Document[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  selectedTags: string[]
  hasMore: boolean
  // 排序
  orderBy: SortField
  order: SortOrder
  // 筛选
  filters: DocumentFilters
  // setters
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSelectedTags: (tags: string[]) => void
  setSort: (orderBy: SortField, order: SortOrder) => void
  setFilters: (patch: Partial<DocumentFilters>) => void
  resetFilters: () => void
  // actions
  fetchDocuments: () => Promise<void>
  loadMore: () => Promise<void>
  reset: () => void
  deleteDocument: (id: string) => Promise<void>
  uploadCover: (id: string, file: File) => Promise<void>
  resetCover: (id: string) => Promise<void>
}

/** 把 store 当前状态转换成 list 接口的查询参数 */
function buildListParams(state: DocumentState, page: number): ListParams {
  const { selectedTags, filters, orderBy, order, pageSize } = state
  const { selectedFolderId } = useFolderStore.getState()
  const createdFrom =
    filters.createdWithinDays != null
      ? new Date(Date.now() - filters.createdWithinDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined
  return {
    page,
    pageSize,
    tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    folderId: selectedFolderId ?? undefined,
    status: filters.status ?? undefined,
    isFavorite: filters.favoriteOnly ? 1 : undefined,
    fileExts: filters.fileExts.length > 0 ? filters.fileExts : undefined,
    createdFrom,
    orderBy,
    order
  }
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  total: 0,
  page: 1,
  pageSize: 10,
  loading: false,
  loadingMore: false,
  error: null,
  selectedTags: [],
  hasMore: false,
  orderBy: 'created_at',
  order: 'desc',
  filters: DEFAULT_FILTERS,

  setPage: (page) => {
    set({ page })
    get().fetchDocuments()
  },

  setPageSize: (pageSize) => {
    set({ pageSize, page: 1, documents: [] })
    get().fetchDocuments()
  },

  setSelectedTags: (selectedTags) => {
    set({ selectedTags, page: 1, documents: [] })
    get().fetchDocuments()
  },

  setSort: (orderBy, order) => {
    set({ orderBy, order, page: 1, documents: [] })
    get().fetchDocuments()
  },

  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch }, page: 1, documents: [] })
    get().fetchDocuments()
  },

  resetFilters: () => {
    set({ filters: DEFAULT_FILTERS, page: 1, documents: [] })
    get().fetchDocuments()
  },

  reset: () => {
    set({ page: 1, documents: [] })
    get().fetchDocuments()
  },

  fetchDocuments: async () => {
    const state = get()
    set({ loading: true, error: null })
    try {
      const result = await documentApi.list(buildListParams(state, state.page))
      const items = result?.items ?? []
      const total = result?.total ?? 0
      set({
        documents: items,
        total,
        hasMore: state.page * state.pageSize < total,
        loading: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载文档列表失败',
        loading: false
      })
    }
  },

  loadMore: async () => {
    const state = get()
    const nextPage = state.page + 1
    set({ loadingMore: true, error: null })
    try {
      const result = await documentApi.list(buildListParams(state, nextPage))
      const items = result?.items ?? []
      const total = result?.total ?? 0
      set({
        documents: [...state.documents, ...items],
        total,
        page: nextPage,
        hasMore: nextPage * state.pageSize < total,
        loadingMore: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载更多失败',
        loadingMore: false
      })
    }
  },

  deleteDocument: async (id: string) => {
    const { documents, total } = get()
    // 乐观更新：先从列表移除，失败再回滚
    const previous = documents
    set({
      documents: documents.filter((d) => d.id !== id),
      total: Math.max(0, total - 1)
    })
    try {
      await documentApi.delete(id)
    } catch (err) {
      // 回滚
      set({ documents: previous, total })
      throw err
    }
  },

  uploadCover: async (id: string, file: File) => {
    const result = await documentApi.uploadCover(id, file)
    if (!result?.coverUrl) return
    set({
      documents: get().documents.map((d) => (d.id === id ? { ...d, coverUrl: result.coverUrl } : d))
    })
  },

  resetCover: async (id: string) => {
    await documentApi.resetCover(id)
    set({
      documents: get().documents.map((d) => (d.id === id ? { ...d, coverUrl: null } : d))
    })
  }
}))
