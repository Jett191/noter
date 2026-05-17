'use client'

/**
 * QuizResultCard —— `/quiz` 第三阶段（graded）的评分与解析卡片。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` `/quiz` 一节与 requirements 7.11。
 *
 * 渲染：
 *   - 顶部：0-100 总分（高亮，按区间着色）
 *   - 列表：每题逐项展示「对 / 错 + 解析」（解析含正确答案与用户作答对比）
 *
 * 此卡片是纯展示组件，不可编辑、不发请求。后端在 graded 阶段一次性返回。
 */

import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Badge } from '@noter/ui/components/badge'
import { cn } from '@noter/ui/lib/utils'
import { Award, CheckCircle2, XCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { QuizGradingResultItem, QuizResultPayload } from '@/types/agent'

export interface QuizResultCardProps {
  payload: QuizResultPayload
}

/** 总分着色规则：≥80 绿 / ≥60 琥珀 / <60 红。 */
function scoreTone(score: number): {
  badgeVariant: 'default' | 'secondary' | 'destructive'
  text: string
  textClass: string
} {
  if (score >= 80) {
    return {
      badgeVariant: 'default',
      text: '优秀',
      textClass: 'text-emerald-600 dark:text-emerald-400'
    }
  }
  if (score >= 60) {
    return {
      badgeVariant: 'secondary',
      text: '及格',
      textClass: 'text-amber-600 dark:text-amber-400'
    }
  }
  return {
    badgeVariant: 'destructive',
    text: '需复习',
    textClass: 'text-rose-600 dark:text-rose-400'
  }
}

export function QuizResultCard({ payload }: QuizResultCardProps) {
  const { results, score } = payload
  const tone = scoreTone(score)
  const correctCount = results.filter((r) => r.correct).length
  const total = results.length

  return (
    <Card className='border-primary/20 w-full'>
      <CardHeader className='space-y-3 pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Award className='text-primary h-4 w-4' />
          测验结果
        </CardTitle>

        {/* 总分展示 */}
        <div className='flex flex-wrap items-baseline gap-3 rounded-md border p-3'>
          <div className='flex items-baseline gap-1'>
            <span className={cn('text-3xl font-bold tabular-nums', tone.textClass)}>{score}</span>
            <span className='text-muted-foreground text-sm'>/ 100</span>
          </div>
          <Badge variant={tone.badgeVariant}>{tone.text}</Badge>
          <span className='text-muted-foreground ml-auto text-xs'>
            答对 <span className='text-foreground font-medium'>{correctCount}</span>
            {' / '}
            {total} 题
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {results.length === 0 ? (
          <p className='text-muted-foreground text-sm'>暂无评分结果</p>
        ) : (
          <ul className='space-y-2'>
            {results.map((item, displayIdx) => (
              <ResultItem key={item.questionIndex} item={item} displayNumber={displayIdx + 1} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 单题评分行
// ---------------------------------------------------------------------------

interface ResultItemProps {
  item: QuizGradingResultItem
  displayNumber: number
}

function ResultItem({ item, displayNumber }: ResultItemProps) {
  const { correct, explanation } = item

  return (
    <li
      className={cn(
        'rounded-md border p-3',
        correct
          ? 'border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/20'
          : 'border-rose-300/40 bg-rose-50/40 dark:border-rose-500/30 dark:bg-rose-950/20'
      )}>
      <div className='mb-1.5 flex items-center gap-2 text-sm font-medium'>
        <span className='bg-primary/10 text-primary inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold'>
          {displayNumber}
        </span>
        {correct ? (
          <span className='flex items-center gap-1 text-emerald-700 dark:text-emerald-300'>
            <CheckCircle2 className='h-3.5 w-3.5' />
            答对
          </span>
        ) : (
          <span className='flex items-center gap-1 text-rose-700 dark:text-rose-300'>
            <XCircle className='h-3.5 w-3.5' />
            答错
          </span>
        )}
      </div>

      {/* 解析（含正确答案 + 用户作答对比，markdown 渲染） */}
      <div
        className={cn(
          'text-foreground text-sm leading-relaxed break-words',
          'prose prose-sm dark:prose-invert max-w-none',
          '[&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1',
          '[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-black/5 [&_pre]:p-2',
          '[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs'
        )}>
        {explanation ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
        ) : (
          <span className='text-muted-foreground/70'>暂无解析</span>
        )}
      </div>
    </li>
  )
}
