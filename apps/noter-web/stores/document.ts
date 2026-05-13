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
  error: string | null
  selectedTags: string[]
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSelectedTags: (tags: string[]) => void
  fetchDocuments: () => Promise<void>
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  total: 0,
  page: 1,
  pageSize: 10,
  loading: false,
  error: null,
  selectedTags: [],

  setPage: (page) => {
    set({ page })
    get().fetchDocuments()
  },

  setPageSize: (pageSize) => {
    set({ pageSize, page: 1 })
    get().fetchDocuments()
  },

  setSelectedTags: (selectedTags) => {
    set({ selectedTags, page: 1 })
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
      set({
        documents: result?.items ?? [],
        total: result?.total ?? 0,
        loading: false
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '加载文档列表失败',
        loading: false
      })
    }
  }
}))
