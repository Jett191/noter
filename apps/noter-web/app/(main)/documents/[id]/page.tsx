'use client'

import { useEffect, use } from 'react'
import { useDocumentDetailStore } from '@/stores/documentDetail'
import type { Document } from '@/types/document'
import { DocumentOutline } from '@/components/document-detail/DocumentOutline'
import DocumentMeta from '@/components/document-detail/DocumentMeta'
import { TemplateRenderer } from '@/components/document-detail/TemplateRenderer'
import { TemplateSwitcher } from '@/components/document-detail/TemplateSwitcher'
import { AIChatPanel } from '@/components/document-detail/AIChatPanel'
import { MindmapViewer } from '@/components/document-detail/MindmapViewer'
import { SummaryCard } from '@/components/document-detail/SummaryCard'
import { DownloadButton } from '@/components/document-detail/DownloadButton'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { Skeleton } from '@noter/ui/components/skeleton'
import { Button } from '@noter/ui/components/button'

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const {
    document,
    loading,
    error,
    template,
    panelVisible,
    fetchDocument,
    setTemplate,
    togglePanel
  } = useDocumentDetailStore()

  useEffect(() => {
    fetchDocument(id)
  }, [id, fetchDocument])

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

  return (
    <div className='flex justify-center gap-6 p-6'>
      {/* 左侧：大纲 */}
      <aside className='sticky top-28 h-[calc(100vh-262px)] w-56 shrink-0'>
        <ScrollArea className='h-full'>
          <DocumentOutline outline={content?.outline ?? null} />
        </ScrollArea>
      </aside>

      {/* 中间：正文 + 思维导图 + 总结 */}
      <main className='max-w-4xl min-w-0 flex-1 space-y-8'>
        {/* 顶部工具栏 */}
        <div className='flex items-center justify-between'>
          <TemplateSwitcher template={template} onTemplateChange={setTemplate} />
          <DownloadButton title={document!.title} />
        </div>

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

      {/* 右侧：文档元信息 */}
      <aside className='sticky top-28 h-fit w-52 shrink-0'>
        <DocumentMeta document={document!} />
      </aside>

      {/* AI 问答面板（可隐藏） */}
      <AIChatPanel visible={panelVisible} onToggle={togglePanel} />
    </div>
  )
}
