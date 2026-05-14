import { create } from 'zustand'
import { documentApi } from '@/lib/axios/documents'
import { tagApi } from '@/lib/axios/tags'
import { aiApi } from '@/lib/axios/ai'
import type { Document, Tag, TemplateType, ProcessingStatus } from '@/types/document'

interface DocumentDetailState {
  document: Document | null
  loading: boolean
  error: string | null
  template: TemplateType
  panelVisible: boolean
  summaryStatus: ProcessingStatus | null
  mindmapStatus: ProcessingStatus | null
  fetchDocument: (id: string) => Promise<void>
  setTemplate: (template: TemplateType) => void
  togglePanel: () => void
  regenerateSummary: () => Promise<void>
  regenerateMindmap: () => Promise<void>
  addTagToDocument: (tag: Tag) => Promise<void>
  removeTagFromDocument: (tagId: string) => Promise<void>
}

const POLL_INTERVAL = 3000

export const useDocumentDetailStore = create<DocumentDetailState>((set, get) => ({
  document: null,
  loading: false,
  error: null,
  template: 'default',
  panelVisible: false,
  summaryStatus: null,
  mindmapStatus: null,

  fetchDocument: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const doc = await documentApi.getById(id)
      set({ document: doc, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取文档失败'
      set({ error: message, loading: false })
    }
  },

  setTemplate: (template: TemplateType) => {
    set({ template })
  },

  togglePanel: () => {
    set((state) => ({ panelVisible: !state.panelVisible }))
  },

  regenerateSummary: async () => {
    const { document } = get()
    if (!document) return

    set({ summaryStatus: 'running' })
    try {
      await aiApi.regenerateSummary(document.id)
      // 轮询状态直到 success 或 failed
      const poll = (): Promise<void> =>
        new Promise((resolve) => {
          const timer = setInterval(async () => {
            try {
              const status = await documentApi.getStatus(document.id)
              if (!status) return
              const summaryStatus = status.summaryStatus as ProcessingStatus
              if (summaryStatus === 'success' || summaryStatus === 'failed') {
                clearInterval(timer)
                set({ summaryStatus })
                // 重新获取文档以更新数据
                if (summaryStatus === 'success') {
                  const doc = await documentApi.getById(document.id)
                  set({ document: doc })
                }
                resolve()
              }
            } catch {
              clearInterval(timer)
              set({ summaryStatus: 'failed' })
              resolve()
            }
          }, POLL_INTERVAL)
        })
      await poll()
    } catch {
      set({ summaryStatus: 'failed' })
    }
  },

  regenerateMindmap: async () => {
    const { document } = get()
    if (!document) return

    set({ mindmapStatus: 'running' })
    try {
      await aiApi.regenerateMindmap(document.id)
      // 轮询状态直到 success 或 failed
      const poll = (): Promise<void> =>
        new Promise((resolve) => {
          const timer = setInterval(async () => {
            try {
              const status = await documentApi.getStatus(document.id)
              if (!status) return
              const mindmapStatus = status.mindmapStatus as ProcessingStatus
              if (mindmapStatus === 'success' || mindmapStatus === 'failed') {
                clearInterval(timer)
                set({ mindmapStatus })
                // 重新获取文档以更新数据
                if (mindmapStatus === 'success') {
                  const doc = await documentApi.getById(document.id)
                  set({ document: doc })
                }
                resolve()
              }
            } catch {
              clearInterval(timer)
              set({ mindmapStatus: 'failed' })
              resolve()
            }
          }, POLL_INTERVAL)
        })
      await poll()
    } catch {
      set({ mindmapStatus: 'failed' })
    }
  },

  addTagToDocument: async (tag: Tag) => {
    const { document } = get()
    if (!document) return
    if (document.tags.some((t) => t.id === tag.id)) return

    // 乐观更新
    const previous = document.tags
    set({ document: { ...document, tags: [...previous, tag] } })

    try {
      await tagApi.addToDocument(document.id, tag.id)
    } catch (err) {
      // 回滚
      set({ document: { ...document, tags: previous } })
      throw err
    }
  },

  removeTagFromDocument: async (tagId: string) => {
    const { document } = get()
    if (!document) return

    const previous = document.tags
    set({ document: { ...document, tags: previous.filter((t) => t.id !== tagId) } })

    try {
      await tagApi.removeFromDocument(document.id, tagId)
    } catch (err) {
      set({ document: { ...document, tags: previous } })
      throw err
    }
  }
}))
