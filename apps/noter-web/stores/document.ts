import { create } from 'zustand'
import { documentApi } from '@/lib/axios/documents'
import { useFolderStore } from '@/stores/folders'
import type { Document } from '@/types/document'

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
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSelectedTags: (tags: string[]) => void
  fetchDocuments: () => Promise<void>
  loadMore: () => Promise<void>
  reset: () => void
  deleteDocument: (id: string) => Promise<void>
  uploadCover: (id: string, file: File) => Promise<void>
  resetCover: (id: string) => Promise<void>
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

  reset: () => {
    set({ page: 1, documents: [] })
    get().fetchDocuments()
  },

  fetchDocuments: async () => {
    const { page, pageSize, selectedTags } = get()
    const { selectedFolderId } = useFolderStore.getState()
    set({ loading: true, error: null })
    try {
      const result = await documentApi.list({
        page,
        pageSize,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
        folderId: selectedFolderId ?? undefined,
        orderBy: 'created_at',
        order: 'desc'
      })
      const items = result?.items ?? []
      const total = result?.total ?? 0
      set({
        documents: items,
        total,
        hasMore: page * pageSize < total,
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
    const { page, pageSize, selectedTags, documents } = get()
    const { selectedFolderId } = useFolderStore.getState()
    const nextPage = page + 1
    set({ loadingMore: true, error: null })
    try {
      const result = await documentApi.list({
        page: nextPage,
        pageSize,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
        folderId: selectedFolderId ?? undefined,
        orderBy: 'created_at',
        order: 'desc'
      })
      const items = result?.items ?? []
      const total = result?.total ?? 0
      set({
        documents: [...documents, ...items],
        total,
        page: nextPage,
        hasMore: nextPage * pageSize < total,
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
