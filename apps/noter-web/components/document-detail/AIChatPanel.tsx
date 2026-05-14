'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@noter/ui/components/sheet'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { MessageSquare, Send, X, Loader2, Square } from 'lucide-react'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'
import { useDocumentDetailStore } from '@/stores/documentDetail'

interface AIChatPanelProps {
  visible: boolean
  onToggle: () => void
}

export function AIChatPanel({ visible, onToggle }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageProps[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const document = useDocumentDetailStore((s) => s.document)

  const isInputEmpty = inputValue.trim().length === 0

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 0)
  }, [])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (isInputEmpty || isLoading || !document) return

    const userMessage: ChatMessageProps = {
      role: 'user',
      content: inputValue.trim()
    }

    // Add user message and an empty assistant message for streaming
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }])
    setInputValue('')
    setIsLoading(true)

    // Build message history for the API (only user/assistant messages)
    const historyMessages = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content
    }))

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          messages: historyMessages
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }))
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `抱歉，出现了错误：${errorData.error || '请求失败'}`
          }
          return updated
        })
        setIsLoading(false)
        return
      }

      // Read the SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      let done = false
      while (!done) {
        const result = await reader.read()
        done = result.done
        const value = result.value
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: `抱歉，出现了错误：${parsed.error}`
                }
                return updated
              })
              break
            }
            if (parsed.content) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + parsed.content
                }
                return updated
              })
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled - keep partial response
      } else {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: '抱歉，网络连接出现问题，请稍后重试。'
          }
          return updated
        })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [inputValue, isInputEmpty, isLoading, document, messages, scrollToBottom])

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
                  <p className='text-muted-foreground/60 mt-1 text-xs'>AI 将基于文档内容为你解答</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <ChatMessage key={index} role={msg.role} content={msg.content} />
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
                <div className='flex items-center gap-2 px-1'>
                  <Loader2 className='text-muted-foreground h-3 w-3 animate-spin' />
                  <span className='text-muted-foreground text-xs'>思考中...</span>
                </div>
              )}
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
              disabled={isLoading}
            />
            {isLoading ? (
              <Button
                size='sm'
                variant='destructive'
                onClick={handleStop}
                className='h-9 shrink-0 px-3'>
                <Square className='h-3 w-3' />
              </Button>
            ) : (
              <Button
                size='sm'
                onClick={handleSend}
                disabled={isInputEmpty || !document}
                className='h-9 shrink-0 px-3'>
                <Send className='h-4 w-4' />
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
