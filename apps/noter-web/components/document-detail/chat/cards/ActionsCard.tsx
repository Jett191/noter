'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { CheckCircle2, BookOpen, Lightbulb } from 'lucide-react'
import type { ActionsPayload } from '@/types/agent'

interface ActionsCardProps {
  payload: ActionsPayload
}

interface ActionsColumnProps {
  title: string
  icon: React.ReactNode
  items: string[]
  emptyHint: string
}

function ActionsColumn({ title, icon, items, emptyHint }: ActionsColumnProps) {
  return (
    <div className='flex flex-col gap-3'>
      <div className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
        {icon}
        <span>{title}</span>
        <span className='text-muted-foreground/60 text-xs font-normal'>({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className='text-muted-foreground/70 text-xs italic'>{emptyHint}</p>
      ) : (
        <ul className='space-y-2'>
          {items.map((item, index) => (
            <li key={index} className='flex items-start gap-2 text-sm leading-relaxed'>
              <span className='bg-primary/60 mt-2 h-1.5 w-1.5 shrink-0 rounded-full' />
              <span className='text-foreground'>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * ActionsCard —— `/actions` Skill 输出的纯展示卡片。
 *
 * 渲染三栏：todos（行动项）、conceptsToLearn（关联概念）、readingSuggestions（延伸阅读）。
 * 仅展示，不勾选 / 不编辑 / 不写回 notes。
 */
export function ActionsCard({ payload }: ActionsCardProps) {
  const { todos, conceptsToLearn, readingSuggestions } = payload

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <CheckCircle2 className='text-primary h-4 w-4' />
          下一步行动
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
          <ActionsColumn
            title='待办事项'
            icon={<CheckCircle2 className='h-4 w-4' />}
            items={todos}
            emptyHint='暂无可执行的待办'
          />
          <ActionsColumn
            title='关联概念'
            icon={<Lightbulb className='h-4 w-4' />}
            items={conceptsToLearn}
            emptyHint='暂无需补学的概念'
          />
          <ActionsColumn
            title='延伸阅读'
            icon={<BookOpen className='h-4 w-4' />}
            items={readingSuggestions}
            emptyHint='暂无延伸阅读建议'
          />
        </div>
      </CardContent>
    </Card>
  )
}
