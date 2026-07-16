'use client'

import { useEffect, use, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDocumentDetailStore } from '@/stores/documentDetail'
import { useFolderStore } from '@/stores/folders'
import type { Document } from '@/types/document'
import { DocumentOutline } from '@/components/document-detail/DocumentOutline'
import DocumentMeta from '@/components/document-detail/DocumentMeta'
import { TemplateRenderer } from '@/components/document-detail/TemplateRenderer'
import { AIChatPanel } from '@/components/document-detail/AIChatPanel'
import { MindmapViewer } from '@/components/document-detail/MindmapViewer'
import { SummaryCard } from '@/components/document-detail/SummaryCard'
import { DocumentDetailHeader } from '@/components/document-detail/DocumentDetailHeader'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { Skeleton } from '@noter/ui/components/skeleton'
import { Button } from '@noter/ui/components/button'
import { findFirstMatchInDom, scrollAndFlash } from '@/utils/feature/search/scrollAndHighlight'

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const matchAnchor = searchParams.get('match')
  const matchQuery = searchParams.get('q')
  const mainRef = useRef<HTMLElement>(null)
  const matchHandledRef = useRef<string | null>(null)
  const {
    document,
    loading,
    error,
    template,
    panelVisible,
    panelSize,
    fetchDocument,
    setTemplate,
    togglePanel,
    setPanelSize
  } = useDocumentDetailStore()
  const folders = useFolderStore((s) => s.folders)
  const fetchFolders = useFolderStore((s) => s.fetchFolders)
  const stopPolling = useDocumentDetailStore((s) => s.stopPolling)

  useEffect(() => {
    fetchDocument(id)
    // 离开详情页时停止后台轮询
    return () => {
      stopPolling()
    }
  }, [id, fetchDocument, stopPolling])

  // 直接访问详情页时也要确保面包屑能拿到文件夹层级
  useEffect(() => {
    if (folders.length === 0) {
      fetchFolders()
    }
  }, [folders.length, fetchFolders])

  // 来自搜索结果的跳转：内容渲染后定位到命中片段并闪烁两次
  useEffect(() => {
    if (!matchAnchor && !matchQuery) return
    // 同一份 URL 只触发一次，刷新后用户重新点回搜索时会带新的 match
    const handledKey = `${id}:${matchAnchor ?? ''}:${matchQuery ?? ''}`
    if (matchHandledRef.current === handledKey) return
    if (loading) return
    if (!mainRef.current) return

    const main = mainRef.current
    let cancelled = false
    let rafId = 0

    const tryLocate = (attempt: number) => {
      if (cancelled) return
      const phrases = [matchAnchor, matchQuery].filter((p): p is string => Boolean(p && p.trim()))
      let found: HTMLElement | null = null
      for (const phrase of phrases) {
        found = findFirstMatchInDom(main, phrase)
        if (found) break
      }
      if (found) {
        matchHandledRef.current = handledKey
        scrollAndFlash(found)
        // 清掉 query，避免后续返回 / 刷新时重复触发
        const next = new URLSearchParams(searchParams.toString())
        next.delete('match')
        next.delete('q')
        const qs = next.toString()
        router.replace(qs ? `/documents/${id}?${qs}` : `/documents/${id}`, { scroll: false })
        return
      }
      // markdown 解析+图片/公式渲染可能比 loading 标志稍晚一点，重试几次
      if (attempt < 20) {
        rafId = window.setTimeout(() => tryLocate(attempt + 1), 80)
      }
    }

    rafId = window.setTimeout(() => tryLocate(0), 60)
    return () => {
      cancelled = true
      if (rafId) window.clearTimeout(rafId)
    }
  }, [id, loading, matchAnchor, matchQuery, router, searchParams])

  // 加载中骨架屏
  if (loading) {
    return (
      <div className='flex gap-6 p-6'>
        <div className='w-56 shrink-0 space-y-4'>
          <Skeleton className='h-6 w-20' />
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
        <div className='flex-1 space-y-4'>
          <Skeleton className='h-8 w-48' />
          <Skeleton className='h-[600px] w-full' />
        </div>
      </div>
    )
  }

  // 错误处理 + 重试
  if (error) {
    return (
      <div className='flex flex-col items-center justify-center gap-4 p-12'>
        <p className='text-destructive'>{error}</p>
        <Button variant='outline' onClick={() => fetchDocument(id)}>
          重试
        </Button>
      </div>
    )
  }

  if (!document) return null

  // 从详情 API 响应中获取关联数据
  const docWithRelations = document as Document & {
    content?: {
      markdownContent: string
      outline: import('@/types/document').OutlineNode[] | null
    } | null
    summary?: import('@/types/document').DocumentSummary | null
    mindmap?: import('@/types/document').DocumentMindmap | null
  }
  const content = docWithRelations.content ?? null
  const summary = docWithRelations.summary ?? null
  const mindmap = docWithRelations.mindmap ?? null

  // AI 面板尺寸 → 布局衍生量
  const aiActive = panelVisible
  const isTall = aiActive && panelSize === 'tall'
  const isWide = aiActive && panelSize === 'wide'
  const showOutline = !isWide
  const showMeta = !isTall && !isWide

  // 右侧栏宽度：normal/tall 用 420px，wide 用更宽，关闭时回到 288px
  const asideWidthClass = !aiActive ? 'w-72' : isWide ? 'w-[640px]' : 'w-[420px]'

  return (
    <div className='flex min-h-screen flex-col'>
      {/* 顶部导航栏：返回 / 面包屑 / 模板切换 / 下载 / AI */}
      <DocumentDetailHeader
        document={document}
        template={template}
        onTemplateChange={setTemplate}
        panelVisible={panelVisible}
        onTogglePanel={togglePanel}
      />

      {/* 主体三栏布局 */}
      <div className='flex flex-1 justify-center gap-6 px-6 pb-6'>
        {/* 左侧：大纲（两栏模式下隐藏） */}
        {showOutline && (
          <aside className='sticky top-20 h-[calc(100vh-6rem)] w-56 shrink-0'>
            <ScrollArea className='h-full'>
              <DocumentOutline outline={content?.outline ?? null} />
            </ScrollArea>
          </aside>
        )}

        {/* 中间：正文 + 思维导图 + 总结 */}
        <main ref={mainRef} className='max-w-4xl min-w-0 flex-1 space-y-8'>
          {/* 文档正文 */}
          {content?.markdownContent ? (
            <TemplateRenderer markdownContent={content.markdownContent} template={template} />
          ) : (
            <div className='text-muted-foreground py-12 text-center'>文档内容加载中...</div>
          )}

          {/* 思维导图 */}
          <MindmapViewer mindmap={mindmap} />

          {/* AI 总结 */}
          <SummaryCard summary={summary} />
        </main>

        {/* 右侧：文档元信息 + AI 问答（悬浮在元数据下方） */}
        <aside
          className={`sticky top-20 flex h-[calc(100vh-6rem)] shrink-0 flex-col gap-4 transition-[width] duration-200 ease-out ${asideWidthClass}`}>
          {showMeta && <DocumentMeta document={document} />}
          <div className='min-h-0 flex-1'>
            <AIChatPanel
              visible={panelVisible}
              onToggle={togglePanel}
              size={panelSize}
              onSizeChange={setPanelSize}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
