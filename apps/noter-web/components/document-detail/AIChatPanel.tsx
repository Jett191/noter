'use client'

/**
 * AIChatPanel —— 文档详情右侧的 AI 对话面板（Task 11.2 重写版）。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` → Frontend Interaction Design 中
 * 「SkillLaunchpad / SlashCommandMenu / SessionBanner / 输入框 placeholder 联动」
 * 段落，以及 requirements.md 需求 1.1-1.9 / 2.1-2.9。
 *
 * 整体职责：
 *   1. 容器壳：保留旧版 normal / tall / wide 三种尺寸切换 + 关闭按钮 + 进出动画。
 *   2. 数据源：消息流来自 `chatSessionStore.messageList`，**不**自己 useState；
 *      `useChatStream({ documentId })` 提供 sendMessage / abort / state。
 *   3. 三入口同源：点 SkillLaunchpad 卡 / SlashCommandMenu 选中 / 自然语言提交 /
 *      Card 内提交 / FollowUp chip 点击 → 全部走 `handleSendUnified`，最终构造
 *      统一 `{ documentId, messages, command?, params?, sessionId? }` 请求体由
 *      `useChatStream.sendMessage` 发出。
 *   4. SkillLaunchpad 显隐：当 `messageList.length === 0` 时显示，否则展示消息流。
 *      首条消息发出后由 store.appendMessage 自动隐藏。
 *   5. SessionBanner：sticky 渲染在消息列表顶部（不随消息滚动）。
 *   6. 输入框 placeholder：按 chatSession.activeSession 的 skill / status 联动，
 *      表见下方 PLACEHOLDER 表。
 *
 * 不在本期实现：
 *   • `pendingSkill` 前端状态机（/explain 反问态走 SSE content，前端无状态）。
 *   • 修改 DocumentDetail 页面其他区域。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Maximize2, MessageSquare, PanelLeftClose, RotateCcw, Send, Square, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@noter/ui/components/alert-dialog'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { cn } from '@noter/ui/lib/utils'

import { aiApi } from '@/lib/axios/ai'

import { useDocumentDetailStore, type AIPanelSize } from '@/stores/documentDetail'
import { useChatSessionStore } from '@/stores/chatSession'
import type { ChatMessage as ChatMessageType, SkillName } from '@/types/agent'

import { ChatMessage, type SendMessageInput } from './ChatMessage'
import { useChatStream } from './sse/useChatStream'
import { SkillLaunchpad } from './chat/SkillLaunchpad'
import { SlashCommandMenu } from './chat/SlashCommandMenu'
import { SessionBanner } from './chat/SessionBanner'

interface AIChatPanelProps {
  visible: boolean
  onToggle: () => void
  size: AIPanelSize
  onSizeChange: (size: AIPanelSize) => void
}

/** 默认 placeholder：未启动任何 session 时使用 */
const DEFAULT_PLACEHOLDER = '输入消息或 / 唤起命令...'

/** 与 design.md「输入框 placeholder 联动」表保持一致的文案。 */
function resolvePlaceholder(activeSkill: SkillName | undefined, hasProgress: boolean): string {
  if (!activeSkill) return DEFAULT_PLACEHOLDER
  if (activeSkill === '/tutor') return '回答 AI 的问题...'
  if (activeSkill === '/quiz') {
    // /quiz 三阶段判定（前端只能从 progress 推断，因 store.activeSession.status 收紧到 'active'）：
    //   - configuring：banner 不带 progress
    //   - answering：banner 带 progress
    // graded 阶段后端会发 ended banner、store 已清空 activeSession，此处不会进入。
    return hasProgress ? '请按上方题组作答...' : '请通过上方表单选择题型与题量...'
  }
  return DEFAULT_PLACEHOLDER
}

export function AIChatPanel({ visible, onToggle, size, onSizeChange }: AIChatPanelProps) {
  // ===== 数据源 =====
  const document = useDocumentDetailStore((s) => s.document)
  const messageList = useChatSessionStore((s) => s.messageList)
  const launchpadVisible = useChatSessionStore((s) => s.launchpadVisible)
  const activeSession = useChatSessionStore((s) => s.activeSession)
  const appendMessage = useChatSessionStore((s) => s.appendMessage)
  const resetForLaunchpad = useChatSessionStore((s) => s.resetForLaunchpad)

  const documentId = document?.id ?? ''

  // useChatStream 在 documentId 为空时不会发请求（fetch 也会 400）；这里允许
  // 空字符串以保持 hook 顺序稳定（避免在 document 加载完成前 hook 数量变化）。
  const { sendMessage, abort, state } = useChatStream({ documentId })

  const isStreaming = state === 'streaming'

  // ===== UI 状态 =====
  const [inputValue, setInputValue] = useState('')
  const [slashOpen, setSlashOpen] = useState(false)
  const [mounted, setMounted] = useState(visible)

  const inputRef = useRef<HTMLInputElement>(null)
  /** 消息列表内容容器 ref；它的 parent 即是 Radix ScrollArea 的 viewport */
  const contentRef = useRef<HTMLDivElement>(null)
  /** 是否处于"贴底"状态：true 时新消息 / 流式增长会自动滚到底；用户向上翻看后置 false */
  const stickToBottomRef = useRef(true)

  // ===== 副作用：进出动画 / 自动滚动 =====

  // 关闭时延迟卸载，留出退场动画时间
  useEffect(() => {
    if (visible) {
      setMounted(true)
      return
    }
    const timer = setTimeout(() => setMounted(false), 200)
    return () => clearTimeout(timer)
  }, [visible])

  // 解析真实的滚动 viewport（Radix ScrollArea 内部容器，data-slot="scroll-area-viewport"）
  const getViewport = useCallback((): HTMLElement | null => {
    const node = contentRef.current
    if (!node) return null
    return node.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
  }, [])

  /** 把 viewport 滚到底；尊重 stickToBottomRef，仅在贴底状态下生效。 */
  const maybeScrollToBottom = useCallback(
    (force = false) => {
      const v = getViewport()
      if (!v) return
      if (!force && !stickToBottomRef.current) return
      // 用 rAF 等本帧 DOM commit 完成（新消息高度算出来）再滚
      requestAnimationFrame(() => {
        v.scrollTop = v.scrollHeight
      })
    },
    [getViewport]
  )

  // 监听 viewport 的 scroll：用户手动向上翻 → 关闭跟随；拖回底部 → 恢复跟随
  useEffect(() => {
    if (!mounted) return
    const v = getViewport()
    if (!v) return
    const onScroll = () => {
      // 距离底部 ≤ 24px 视为贴底（容忍亚像素 / 内部 padding）
      const distanceFromBottom = v.scrollHeight - v.clientHeight - v.scrollTop
      stickToBottomRef.current = distanceFromBottom <= 24
    }
    v.addEventListener('scroll', onScroll, { passive: true })
    return () => v.removeEventListener('scroll', onScroll)
  }, [mounted, getViewport])

  // ResizeObserver 监听内容尺寸变化（流式 content 增长 / 卡片渲染 / 占位插入都会触发）
  useEffect(() => {
    if (!mounted) return
    const target = contentRef.current
    if (!target || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      maybeScrollToBottom(false)
    })
    ro.observe(target)
    return () => ro.disconnect()
  }, [mounted, maybeScrollToBottom])

  // 消息条数变化时强制滚到底（包含用户主动发送 / 切换 SkillLaunchpad → 消息流的瞬间）
  useEffect(() => {
    // 用户主动操作（appendMessage 是手动调用的）等同明确意图回到底部
    stickToBottomRef.current = true
    maybeScrollToBottom(true)
  }, [messageList.length, maybeScrollToBottom])

  // ===== 输入框 placeholder：根据 activeSession 联动 =====
  const placeholder = useMemo(
    () => resolvePlaceholder(activeSession?.skill, !!activeSession?.progress),
    [activeSession?.skill, activeSession?.progress]
  )

  // ===== 三入口同源：handleSendUnified =====

  /**
   * 唯一的发送入口。所有触发路径（Launchpad 卡 / SlashCommandMenu / 自然语言 /
   * Quiz 配置提交 / Quiz 答案提交 / FollowUp chip）最终都调用此函数。
   *
   * 行为：
   *   1. 校验 documentId 与流式状态——文档未加载或正在流式中直接忽略；
   *      重复点击不会触发竞态。
   *   2. 若有 `content`（用户文字消息）→ 先 appendMessage 到 store，让消息流
   *      立刻显示用户气泡。command-only / Quiz 提交不带 content，不入消息流。
   *   3. 构造 messages 数组：取当前 messageList 中的纯文本（user / 无 messageType
   *      的 assistant），保留 role + content；结构化消息不参与对话历史。
   *   4. 调用 useChatStream.sendMessage —— sessionId 由 hook 内部从
   *      store.activeSession.id 自动续签（设计意图见 useChatStream 注释）。
   *
   * 重要约束（与后端契合）：
   *   • Quiz 提交（answering / graded）**不**附带 command。caller 通过
   *     `command === undefined` + `params: { config | answers }` 触发 SkillRouter
   *     第二级 mode='resume'。
   *   • 用户在活跃 /quiz session 期间点 SkillLaunchpad 中的 /quiz → 视为
   *     Skill 切换（fresh 启动新 session）；此处**不**做前端拦截，由后端 orchestrator
   *     的 Skill_Switch 编排负责打断旧 session 后启动新 session。
   */
  const handleSendUnified = useCallback(
    async (input: { command?: SkillName; params?: Record<string, unknown>; content?: string }) => {
      if (!documentId) return
      if (isStreaming) return

      // 必须至少有一项可发送：文本 / command / params
      const hasContent = !!input.content && input.content.trim().length > 0
      const hasCommand = !!input.command
      const hasParams = !!input.params && Object.keys(input.params).length > 0
      if (!hasContent && !hasCommand && !hasParams) return

      // 先快照真实对话历史（后端仅看真实 user / assistant 文本，不看合成气泡 / 结构化卡片）。
      const messagesPayload = useChatSessionStore
        .getState()
        .messageList.filter(
          (m) => !m.messageType && !m.synthetic && (m.role === 'user' || m.role === 'assistant')
        )
        .map((m) => ({ role: m.role, content: m.content }))
      // 自然语言路径再把当前文本拼到末尾（store 里的 user 气泡可能还没 flush）
      if (hasContent) {
        messagesPayload.push({ role: 'user', content: input.content!.trim() })
      }

      // 写入用户气泡（命令路径用合成气泡描述用户操作；自然语言路径写真实文本）。
      if (hasContent) {
        const userMsg: ChatMessageType = {
          id: createMessageId(),
          role: 'user',
          content: input.content!.trim(),
          createdAt: Date.now()
        }
        appendMessage(userMsg)
      } else {
        const label = describeUserAction(input.command, input.params)
        if (label) {
          const userMsg: ChatMessageType = {
            id: createMessageId(),
            role: 'user',
            content: label,
            createdAt: Date.now(),
            synthetic: true
          }
          appendMessage(userMsg)
        }
      }

      // 立即追加 assistant 占位（typing 动画），让用户看到"AI 在思考"反馈；
      // useChatStream 在收到首个 content 时会就地升级为正文，收到 structured_message 时丢弃占位再插卡片。
      const placeholder: ChatMessageType = {
        id: createMessageId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        isLoading: true
      }
      appendMessage(placeholder)

      try {
        await sendMessage({
          messages: messagesPayload,
          command: input.command,
          params: input.params
        })
      } catch {
        // useChatStream 已经把错误消息 append 到 store；此处仅吞掉避免抛 unhandled rejection
      }
    },
    [appendMessage, documentId, isStreaming, sendMessage]
  )

  // ===== 输入框：发送 / 斜杠命令检测 =====

  const handleInputChange = (value: string) => {
    setInputValue(value)
    // 检测斜杠命令：首字符为 `/` 时打开浮层；用户开始输入参数（出现空格）后关闭，
    // 让 Enter 走正常发送路径而不是被浮层吃掉去选中聚焦项。
    if (value.startsWith('/') && !value.includes(' ')) {
      setSlashOpen(true)
    } else if (slashOpen) {
      setSlashOpen(false)
    }
  }

  const handleSendFromInput = useCallback(() => {
    const trimmed = inputValue.trim()
    if (trimmed.length === 0) return

    // 关闭斜杠浮层（如果还开着）
    setSlashOpen(false)

    // 输入框文本如果以 `/skill` 开头 + 后续参数 → 当 command 处理；否则当
    // 自然语言处理。简化匹配：完整 token 必须命中 SkillName 集合。
    const match = trimmed.match(/^(\/brief|\/tutor|\/explain|\/actions|\/quiz)(?:\s+(.+))?$/)
    if (match) {
      const command = match[1] as SkillName
      const rest = match[2]?.trim()
      // /explain 携带参数时把 rest 作为 concept；其它 Skill 暂不接受额外参数。
      const params =
        command === '/explain' && rest && rest.length > 0 ? { concept: rest } : undefined
      // command-only 入口不发用户文本气泡（与 SkillLaunchpad 卡片点击行为一致）。
      void handleSendUnified({ command, params })
    } else {
      void handleSendUnified({ content: trimmed })
    }

    setInputValue('')
  }, [handleSendUnified, inputValue])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // SlashCommandMenu 的 window 级 keydown（capture）会先吃住 Enter 用于选中；
      // 这里走到说明浮层未拦截（关闭状态），按发送处理。
      e.preventDefault()
      handleSendFromInput()
    }
  }

  // ===== SlashCommandMenu 选中：把命令拼回输入框 =====

  const handleSlashPick = useCallback(
    (skill: SkillName) => {
      setSlashOpen(false)
      // 把命令文本写回输入框；requiresParams 的 Skill（/explain）保留尾部空格让用户继续输入参数
      const requiresParams = skill === '/explain'
      const nextText = requiresParams ? `${skill} ` : skill
      setInputValue(nextText)
      // 把焦点重新交还给输入框、光标停在末尾
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        const el = inputRef.current
        if (el) {
          const len = nextText.length
          el.setSelectionRange(len, len)
        }
      })
      // 不带参数的 Skill 直接发；带参数的 Skill 等待用户继续输入后回车
      if (!requiresParams) {
        // 用 setTimeout 让上面的 setInputValue 先 flush；并通过 handleSendUnified
        // 走 command 路径，**不**重新走输入框 parse（避免在 input value 还没更新时
        // 误判为空字符串）。
        setTimeout(() => {
          void handleSendUnified({ command: skill })
          setInputValue('')
        }, 0)
      }
    },
    [handleSendUnified]
  )

  // ===== SkillLaunchpad 卡片点击 =====

  const handleLaunchpadPick = useCallback(
    (skill: SkillName) => {
      // /explain 需要 concept 参数 —— 与 SlashCommand 对待一致：把命令文本写入
      // 输入框等待用户补参数，不立即触发。
      if (skill === '/explain') {
        const text = `${skill} `
        setInputValue(text)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          const el = inputRef.current
          if (el) el.setSelectionRange(text.length, text.length)
        })
        return
      }
      void handleSendUnified({ command: skill })
    },
    [handleSendUnified]
  )

  // ===== ChatMessage 内 Quiz 卡 / FollowUp 触发的发送 =====

  const handleSendFromMessage = useCallback(
    (payload: SendMessageInput) => {
      void handleSendUnified({ command: payload.command, params: payload.params })
    },
    [handleSendUnified]
  )

  // ===== 中断 =====

  const handleStop = useCallback(() => {
    abort()
  }, [abort])

  // ===== 重置：清空对话流，恢复到 SkillLaunchpad =====

  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const handleConfirmReset = useCallback(async () => {
    setResetting(true)
    try {
      // 流式中先打断（abort 是同步的，无需 await）
      abort()
      // 后端 session 标记 ended，避免脏数据；失败时不阻塞前端清理（消息已经无意义）
      const sessionId = activeSession?.id
      if (sessionId) {
        try {
          await aiApi.endSession(sessionId)
        } catch (err) {
          console.error('[AIChatPanel] endSession on reset failed', err)
        }
      }
      resetForLaunchpad()
      setResetOpen(false)
    } finally {
      setResetting(false)
    }
  }, [abort, activeSession?.id, resetForLaunchpad])

  const canReset = messageList.length > 0 || activeSession !== null

  if (!mounted) return null

  const isInputEmpty = inputValue.trim().length === 0
  const showLaunchpad = launchpadVisible && messageList.length === 0

  return (
    <div
      role='dialog'
      aria-label='AI 问答'
      className={cn(
        'pointer-events-auto flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-xl border shadow-lg',
        'bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-md',
        'transition-all duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      )}>
      {/* 头部 */}
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <MessageSquare className='h-4 w-4' />
          AI 问答
        </div>
        <div className='flex items-center gap-1'>
          {/* 重置对话：清空消息流并退出当前活跃 session */}
          <Button
            variant='ghost'
            size='icon-sm'
            disabled={!canReset}
            onClick={() => setResetOpen(true)}
            aria-label='重置对话'
            title='重置对话'>
            <RotateCcw className='h-4 w-4' />
          </Button>
          {/* 向上拉长：覆盖文档元数据 */}
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => onSizeChange(size === 'tall' ? 'normal' : 'tall')}
            aria-pressed={size === 'tall'}
            aria-label={size === 'tall' ? '恢复默认尺寸' : '展开覆盖文档元数据'}
            title={size === 'tall' ? '恢复默认尺寸' : '展开覆盖文档元数据'}>
            <Maximize2 className='h-4 w-4' />
          </Button>
          {/* 两栏布局：隐藏元数据与大纲 */}
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => onSizeChange(size === 'wide' ? 'normal' : 'wide')}
            aria-pressed={size === 'wide'}
            aria-label={size === 'wide' ? '恢复三栏布局' : '切换为两栏布局'}
            title={size === 'wide' ? '恢复三栏布局' : '切换为两栏布局'}>
            <PanelLeftClose className='h-4 w-4' />
          </Button>
          <Button variant='ghost' size='icon-sm' onClick={onToggle} aria-label='关闭'>
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* SessionBanner：sticky 在 ScrollArea 之外，不随消息滚动 */}
      {activeSession && (
        <div className='border-b px-3 py-2'>
          <SessionBanner />
        </div>
      )}

      {/* 主内容区：SkillLaunchpad 或 消息流 */}
      <ScrollArea className='flex-1 overflow-hidden'>
        <div ref={contentRef} className='flex h-full flex-col gap-3 p-4'>
          {showLaunchpad ? (
            <div className='flex h-full flex-col gap-4'>
              <SkillLaunchpad size={size} onPickSkill={handleLaunchpadPick} />
              <div className='border-muted-foreground/20 mt-auto flex items-center gap-3 border-t pt-3'>
                <span className='border-muted-foreground/20 flex-1 border-t' aria-hidden='true' />
                <span className='text-muted-foreground text-xs'>或直接提问</span>
                <span className='border-muted-foreground/20 flex-1 border-t' aria-hidden='true' />
              </div>
            </div>
          ) : (
            <>
              {messageList.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onSendMessage={handleSendFromMessage}
                  submitting={isStreaming}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* 底部输入区域：包一层 relative 容器以便 SlashCommandMenu 浮层定位 */}
      <div className='border-t p-3'>
        <div className='relative flex gap-2'>
          <SlashCommandMenu
            open={slashOpen}
            onPick={handleSlashPick}
            onClose={() => setSlashOpen(false)}
            anchorRef={inputRef}
          />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className='h-9 flex-1 text-sm'
            disabled={isStreaming || !document}
          />
          {isStreaming ? (
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
              onClick={handleSendFromInput}
              disabled={isInputEmpty || !document}
              className='h-9 shrink-0 px-3'>
              <Send className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>

      {/* 重置对话二次确认 */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置当前对话？</AlertDialogTitle>
            <AlertDialogDescription>
              将清空所有消息记录{activeSession ? '并退出当前会话' : ''}
              ，并回到启动面板。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleConfirmReset}
              disabled={resetting}>
              {resetting ? '重置中...' : '确认重置'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 把命令路径（Launchpad 卡 / SlashCommand 选中 / FollowUp chip / Quiz 卡内提交）
 * 描述为用户视角的可读 label，用于合成用户气泡（synthetic=true）。
 *
 * 这条气泡仅展示给用户看，不会进入发往后端的对话历史；保持 UI 反馈一致即可，
 * 文案不必精确等同后端 SkillManifest.label。
 */
function describeUserAction(
  command: SkillName | undefined,
  params: Record<string, unknown> | undefined
): string | null {
  // /quiz 三阶段判定：configuring 触发 + count → answering；answering 提交 answers → graded
  if (params && Object.prototype.hasOwnProperty.call(params, 'config')) {
    const cfg = params.config as { count?: number } | undefined
    const count = cfg && typeof cfg.count === 'number' ? cfg.count : undefined
    return count ? `开始测验，${count} 题` : '开始测验'
  }
  if (params && Object.prototype.hasOwnProperty.call(params, 'answers')) {
    return '提交答卷'
  }
  if (params && params.exit === true) {
    return '退出当前会话'
  }
  if (!command) return null
  switch (command) {
    case '/brief':
      return '📖 速览这篇'
    case '/tutor':
      return '🎓 章节私教'
    case '/quiz':
      return '📝 考考我'
    case '/actions':
      return '✅ 行动项提取'
    case '/explain': {
      const concept =
        params && typeof params.concept === 'string' && params.concept.trim().length > 0
          ? params.concept.trim()
          : null
      return concept ? `💡 解释：${concept}` : '💡 解释概念'
    }
  }
}
