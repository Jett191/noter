'use client'

/**
 * TutorTurnCard —— /tutor 章节私教单轮卡片。
 *
 * 渲染 design.md 中定义的 TutorTurnPayload：
 *   { chapterTitle, chapterIndex, totalChapters, explanation, question }
 *
 * 排版约定：
 *   - 顶部：章节标题 + 「第 {chapterIndex+1}/{totalChapters} 章」徽标
 *   - 中部：核心讲解（200-400 字 markdown，复用 ChatMessage 的 react-markdown
 *     + remark-gfm 排版规则保持视觉一致）
 *   - 底部：引导问题以引用块 / 强调样式突出，提示用户这是需要回答的问题
 *
 * SessionBanner 已经把整体进度固定在消息列表顶部，本卡片底部进度仅作冗余兜底，
 * 即便用户滚开 banner 也能在卡片内看到自己读到第几章。
 */

import { Badge } from '@noter/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { cn } from '@noter/ui/lib/utils'
import { GraduationCap, HelpCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { TutorTurnPayload } from '@/types/agent'

export interface TutorTurnCardProps {
  payload: TutorTurnPayload
}

export function TutorTurnCard({ payload }: TutorTurnCardProps) {
  const { chapterTitle, chapterIndex, totalChapters, explanation, question } = payload

  // chapterIndex 是 0-based，展示给用户时 +1 更直观。
  const safeTotal = Math.max(totalChapters, 1)
  const displayIndex = Math.min(Math.max(chapterIndex, 0) + 1, safeTotal)

  return (
    <Card className='border-primary/20 bg-card/60 w-full max-w-[85%] shadow-sm'>
      <CardHeader className='space-y-2 pb-3'>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className='gap-1'>
            <GraduationCap className='h-3 w-3' />第 {displayIndex}/{safeTotal} 章
          </Badge>
        </div>
        <CardTitle className='text-base leading-snug break-words'>{chapterTitle}</CardTitle>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* 核心讲解：复用 ChatMessage 的 prose 配色规则，保持流式渲染一致性 */}
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
            <span className='text-muted-foreground/60'>...</span>
          )}
        </div>

        {/* 引导问题：用 blockquote 风格 + 左色条突出，告诉用户这是要回答的题目 */}
        <div
          className='border-primary bg-primary/5 text-foreground rounded-md border-l-4 px-4 py-3'
          role='note'
          aria-label='引导问题'>
          <div className='text-primary mb-1 flex items-center gap-1.5 text-xs font-medium'>
            <HelpCircle className='h-3.5 w-3.5' />
            引导提问
          </div>
          <p className='text-sm leading-relaxed break-words'>{question}</p>
        </div>
      </CardContent>
    </Card>
  )
}
