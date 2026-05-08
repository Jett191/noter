'use client'

import { useCallback, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@noter/ui/components/sheet'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { MessageSquare, Send, X } from 'lucide-react'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

interface AIChatPanelProps {
  visible: boolean
  onToggle: () => void
}

export function AIChatPanel({ visible, onToggle }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageProps[]>([])
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const isInputEmpty = inputValue.trim().length === 0

  const scrollToBottom = useCallback(() => {
    // 使用 setTimeout 确保 DOM 更新后再滚动
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 0)
  }, [])

  const handleSend = () => {
    if (isInputEmpty) return

    const userMessage: ChatMessageProps = {
      role: 'user',
      content: inputValue.trim()
    }

    const assistantMessage: ChatMessageProps = {
      role: 'assistant',
      content: 'AI 问答功能即将上线'
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInputValue('')
    scrollToBottom()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* 展开按钮（面板关闭时显示） */}
      {!visible && (
        <Button
          variant='outline'
          size='sm'
          onClick={onToggle}
          className='fixed top-1/2 right-4 z-40 flex -translate-y-1/2 items-center gap-1.5'>
          <MessageSquare className='h-4 w-4' />
          <span className='text-xs'>AI 问答</span>
        </Button>
      )}

      {/* 右侧面板 */}
      <Sheet open={visible} onOpenChange={onToggle}>
        <SheetContent
          side='right'
          showCloseButton={false}
          className='flex w-[380px] flex-col p-0 sm:max-w-[380px]'>
          {/* 头部 */}
          <SheetHeader className='flex-row items-center justify-between border-b px-4 py-3'>
            <SheetTitle className='flex items-center gap-2 text-sm'>
              <MessageSquare className='h-4 w-4' />
              AI 问答
            </SheetTitle>
            <Button variant='ghost' size='icon-sm' onClick={onToggle}>
              <X className='h-4 w-4' />
              <span className='sr-only'>关闭</span>
            </Button>
          </SheetHeader>

          {/* 消息列表 */}
          <ScrollArea className='flex-1 overflow-hidden'>
            <div ref={scrollRef} className='flex h-full flex-col gap-3 overflow-y-auto p-4'>
              {messages.length === 0 && (
                <div className='flex h-full flex-col items-center justify-center py-12 text-center'>
                  <MessageSquare className='text-muted-foreground/40 mb-3 h-10 w-10' />
                  <p className='text-muted-foreground text-sm'>围绕文档内容提问</p>
                  <p className='text-muted-foreground/60 mt-1 text-xs'>AI 问答功能即将上线</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <ChatMessage key={index} role={msg.role} content={msg.content} />
              ))}
            </div>
          </ScrollArea>

          {/* 底部输入区域 */}
          <div className='flex gap-2 border-t p-3'>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='输入你的问题...'
              className='h-9 flex-1 text-sm'
            />
            <Button
              size='sm'
              onClick={handleSend}
              disabled={isInputEmpty}
              className='h-9 shrink-0 px-3'>
              <Send className='h-4 w-4' />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
