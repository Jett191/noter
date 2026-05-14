'use client'

import { cn } from '@noter/ui/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className='flex w-full justify-end'>
        <div className='bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap'>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className='flex w-full justify-start'>
      <div
        className={cn(
          'bg-muted text-muted-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm break-words',
          'prose prose-sm dark:prose-invert max-w-none',
          '[&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1',
          '[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-black/5 [&_pre]:p-2',
          '[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs'
        )}>
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <span className='text-muted-foreground/50'>...</span>
        )}
      </div>
    </div>
  )
}
