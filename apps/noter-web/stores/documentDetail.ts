import { create } from 'zustand'
import { documentApi } from '@/lib/axios/documents'
import { tagApi } from '@/lib/axios/tags'
import { aiApi } from '@/lib/axios/ai'
import type { Document, Tag, TemplateType, ProcessingStatus } from '@/types/document'

export type AIPanelSize = 'normal' | 'tall' | 'wide'

interface DocumentDetailState {
  document: Document | null
  loading: boolean
  error: string | null
  template: TemplateType
  panelVisible: boolean
  panelSize: AIPanelSize
  summaryStatus: ProcessingStatus | null
  mindmapStatus: ProcessingStatus | null
  pollingTimer: ReturnType<typeof setInterval> | null
  fetchDocument: (id: string) => Promise<void>
  setTemplate: (template: TemplateType) => void
  togglePanel: () => void
  setPanelSize: (size: AIPanelSize) => void
  regenerateSummary: () => Promise<void>
  regenerateMindmap: () => Promise<void>
  addTagToDocument: (tag: Tag) => Promise<void>
  removeTagFromDocument: (tagId: string) => Promise<void>
  stopPolling: () => void
}

const POLL_INTERVAL = 3000
// 5 分钟保护：100 次 × 3s。超时后强制结束轮询并标记为 failed
const MAX_POLL_ATTEMPTS = 100

const isInProgress = (status: ProcessingStatus | null | undefined): boolean =>
  status === 'pending' || status === 'running'

export const useDocumentDetailStore = create<DocumentDetailState>((set, get) => ({
  document: null,
  loading: false,
  error: null,
  template: 'default',
  panelVisible: false,
  panelSize: 'normal',
  summaryStatus: null,
  mindmapStatus: null,
  pollingTimer: null,

  stopPolling: () => {
    const { pollingTimer } = get()
    if (pollingTimer) {
      clearInterval(pollingTimer)
      set({ pollingTimer: null })
    }
  },

  fetchDocument: async (id: string) => {
    // 切换文档时停止之前的轮询
    get().stopPolling()
    set({ loading: true, error: null })
    try {
      const doc = await documentApi.getById(id)
      set({
        document: doc,
        summaryStatus: doc?.summaryStatus ?? null,
        mindmapStatus: doc?.mindmapStatus ?? null,
        loading: false
      })

      // 如果 summary / mindmap 还在生成中，启动轮询
      if (doc && (isInProgress(doc.summaryStatus) || isInProgress(doc.mindmapStatus))) {
        let attempts = 0
        const timer = setInterval(async () => {
          attempts += 1

          // 超过最大次数：兜底标记 failed，停止轮询
          if (attempts > MAX_POLL_ATTEMPTS) {
            const cur = get()
            set({
              summaryStatus: isInProgress(cur.summaryStatus) ? 'failed' : cur.summaryStatus,
              mindmapStatus: isInProgress(cur.mindmapStatus) ? 'failed' : cur.mindmapStatus
            })
            get().stopPolling()
            return
          }

          try {
            const status = await documentApi.getStatus(id)
            if (!status) return

            const summaryStatus = status.summaryStatus as ProcessingStatus
            const mindmapStatus = status.mindmapStatus as ProcessingStatus

            const prevSummaryStatus = get().summaryStatus
            const prevMindmapStatus = get().mindmapStatus

            set({ summaryStatus, mindmapStatus })

            // 任意一个从进行中变成 success，重新拉取详情以加载新数据
            const summaryDone = isInProgress(prevSummaryStatus) && summaryStatus === 'success'
            const mindmapDone = isInProgress(prevMindmapStatus) && mindmapStatus === 'success'
            if (summaryDone || mindmapDone) {
              const fresh = await documentApi.getById(id)
              if (fresh) set({ document: fresh })
            }

            // 都已完成（success 或 failed），停止轮询
            if (!isInProgress(summaryStatus) && !isInProgress(mindmapStatus)) {
              get().stopPolling()
            }
          } catch {
            // 单次失败不停轮询，下次再试
          }
        }, POLL_INTERVAL)
        set({ pollingTimer: timer })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取文档失败'
      set({ error: message, loading: false })
    }
  },

  setTemplate: (template: TemplateType) => {
    set({ template })
  },

  togglePanel: () => {
    set((state) => ({
      panelVisible: !state.panelVisible,
      // 关闭时把尺寸恢复成 normal，避免下次打开还停留在放大态
      panelSize: !state.panelVisible ? state.panelSize : 'normal'
    }))
  },

  setPanelSize: (size: AIPanelSize) => {
    set({ panelSize: size })
  },

  regenerateSummary: async () => {
    const { document } = get()
    if (!document) return

    set({ summaryStatus: 'running' })
    try {
      await aiApi.regenerateSummary(document.id)
      // 轮询状态直到 success / failed / 超过最大次数
      const poll = (): Promise<void> =>
        new Promise((resolve) => {
          let attempts = 0
          const timer = setInterval(async () => {
            attempts += 1
            if (attempts > MAX_POLL_ATTEMPTS) {
              clearInterval(timer)
              set({ summaryStatus: 'failed' })
              resolve()
              return
            }
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
      // 轮询状态直到 success / failed / 超过最大次数
      const poll = (): Promise<void> =>
        new Promise((resolve) => {
          let attempts = 0
          const timer = setInterval(async () => {
            attempts += 1
            if (attempts > MAX_POLL_ATTEMPTS) {
              clearInterval(timer)
              set({ mindmapStatus: 'failed' })
              resolve()
              return
            }
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
