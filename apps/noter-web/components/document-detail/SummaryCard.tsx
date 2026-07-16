'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Badge } from '@noter/ui/components/badge'
import { Button } from '@noter/ui/components/button'
import { RefreshCw, Loader2, Sparkles } from 'lucide-react'
import type { DocumentSummary } from '@/types/document'
import { useDocumentDetailStore } from '@/stores/documentDetail'

interface SummaryCardProps {
  summary: DocumentSummary | null
}

export function SummaryCard({ summary }: SummaryCardProps) {
  const summaryStatus = useDocumentDetailStore((s) => s.summaryStatus)
  const regenerateSummary = useDocumentDetailStore((s) => s.regenerateSummary)

  const isRunning = summaryStatus === 'running'
  const isPending = summaryStatus === 'pending' || summaryStatus === 'running'
  const hasSummary = summary && summary.summary

  // 生成中占位（后端正在处理）
  if (!hasSummary && isPending) {
    return (
      <Card>
        <CardHeader className='flex-row items-center justify-between pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Sparkles className='text-primary h-4 w-4' />
            AI 总结
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center justify-center gap-3 py-8'>
            <Loader2 className='text-primary h-6 w-6 animate-spin' />
            <p className='text-muted-foreground text-sm'>AI 正在生成总结，请稍候...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 空状态
  if (!hasSummary) {
    return (
      <div className='border-muted-foreground/30 bg-muted/10 flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-12'>
        <Sparkles className='text-muted-foreground/40 h-8 w-8' />
        <p className='text-muted-foreground text-sm'>暂无 AI 总结</p>
        <Button variant='outline' size='sm' onClick={regenerateSummary} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='mr-1.5 h-4 w-4' />
          )}
          {isRunning ? '生成中...' : '生成总结'}
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Sparkles className='text-primary h-4 w-4' />
          AI 总结
        </CardTitle>
        <Button variant='ghost' size='sm' onClick={regenerateSummary} disabled={isRunning}>
          {isRunning ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='h-4 w-4' />
          )}
          <span className='ml-1.5'>{isRunning ? '生成中...' : '重新生成'}</span>
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* 核心摘要 */}
        <p className='text-foreground text-sm leading-relaxed'>{summary.summary}</p>

        {/* 关键要点 */}
        {summary.keyPoints && summary.keyPoints.length > 0 && (
          <div className='space-y-2'>
            <h4 className='text-muted-foreground text-sm font-medium'>关键要点</h4>
            <ul className='space-y-1.5'>
              {summary.keyPoints.slice(0, 5).map((point, index) => (
                <li key={index} className='flex items-start gap-2 text-sm'>
                  <span className='bg-primary mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full' />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 关键词 */}
        {summary.keywords && summary.keywords.length > 0 && (
          <div className='space-y-2'>
            <h4 className='text-muted-foreground text-sm font-medium'>关键词</h4>
            <div className='flex flex-wrap gap-1.5'>
              {summary.keywords.map((keyword, index) => (
                <Badge key={index} variant='secondary'>
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
