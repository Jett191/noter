'use client'

/**
 * ChatMessage —— 消息流中单条消息的渲染入口（Task 11.2）。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` → Frontend Interaction Design 中
 * 「结构化卡片消息」段落，以及 requirements.md 需求 1.3 / 10.4 / 9.1-9.4。
 *
 * 渲染规则：
 *   • `messageType` 缺省 → 纯文本消息：user 走气泡、assistant 走 markdown
 *     （react-markdown + remark-gfm，与旧版风格保持一致）。
 *   • `messageType` 存在 → 按枚举分支渲染对应 Card 组件，payload 按
 *     `StructuredPayloadMap[messageType]` 收窄；若 payload 为空则 fallback
 *     到 content 文本兜底渲染（一般不会发生，仅做防御）。
 *   • `followUps`（来自 SSE `follow_ups` 事件）存在时在卡片 / 文本之后追加
 *     `<FollowUpChips>`；空数组 / 缺省时隐藏。
 *
 * 为什么把「QuizConfigPrompt / QuizGroupCard 提交」转交给 caller：
 *   这两张卡需要触发 SSE 续签（不带 command、带 sessionId、params 为
 *   `{ config }` 或 `{ answers }`）。把请求拼装逻辑收敛在 AIChatPanel 的
 *   `onSendMessage` 内可保证三入口同源（点 SkillLaunchpad / SlashCommandMenu /
 *   自然语言 / Card 提交 / FollowUp 点击）最终走同一份 `useChatStream.sendMessage`
 *   调用，不在 ChatMessage 内重复实现 sessionId 解析与请求拼装。
 */

import { cn } from '@noter/ui/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@noter/ui/components/avatar'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useUserStore } from '@/stores/user'

import type {
  ActionsPayload,
  BriefPayload,
  ChatMessage as ChatMessageType,
  ExplainPayload,
  FollowUpChip,
  QuizConfig,
  QuizConfigPayload,
  QuizGroupPayload,
  QuizResultPayload,
  TutorTurnPayload
} from '@/types/agent'

import { FollowUpChips } from './chat/FollowUpChips'
import { ActionsCard } from './chat/cards/ActionsCard'
import { BriefCard } from './chat/cards/BriefCard'
import { ExplainCard } from './chat/cards/ExplainCard'
import { QuizConfigPrompt } from './chat/cards/QuizConfigPrompt'
import { QuizGroupCard } from './chat/cards/QuizGroupCard'
import { QuizResultCard } from './chat/cards/QuizResultCard'
import { TutorTurnCard } from './chat/cards/TutorTurnCard'

/**
 * `onSendMessage` 入参：与 AIChatPanel 中的 `handleSendUnified` 同形。
 *   • Quiz 配置 / 答题提交：仅传 `params`（不带 command、由 useChatStream
 *     从 store 读 sessionId 续签）
 *   • FollowUp chip：传 `command` + 可选 `params`，按 fresh 启动新 Skill
 */
export interface SendMessageInput {
  command?: FollowUpChip['command']
  params?: Record<string, unknown>
}

export interface ChatMessageProps {
  message: ChatMessageType
  /** 由 AIChatPanel 注入的统一发送入口；Quiz 卡片提交与 chip 点击都走它。 */
  onSendMessage: (payload: SendMessageInput) => void
  /** 是否处于流式中——透传给 Quiz 卡片禁用按钮，避免重复提交。 */
  submitting?: boolean
}

export function ChatMessage({ message, onSendMessage, submitting }: ChatMessageProps) {
  const { role, messageType, payload, content, followUps, isLoading } = message
  const isUser = role === 'user'
  const user = useUserStore((s) => s.user)

  // ----- 1) 用户消息：永远是纯文本气泡（user 不会下发结构化消息） -----
  if (isUser) {
    const displayName = user?.username || user?.email || '我'
    const fallback = (displayName[0] ?? '?').toUpperCase()
    return (
      <div className='animate-in slide-in-from-bottom-1 fade-in-0 flex w-full items-center justify-end gap-2 duration-200'>
        <div className='bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap'>
          {content}
        </div>
        <Avatar className='size-7 shrink-0'>
          <AvatarImage
            src={user?.avatarUrl ?? undefined}
            alt={displayName}
            referrerPolicy='no-referrer'
          />
          <AvatarFallback className='text-xs'>{fallback}</AvatarFallback>
        </Avatar>
      </div>
    )
  }

  // ----- 2) Assistant 结构化消息：按 messageType 分支渲染 -----
  if (messageType) {
    const card = renderStructuredCard(messageType, payload, {
      onSubmitQuizConfig: (config) => onSendMessage({ params: { config } }),
      onSubmitQuizAnswers: (answers) => onSendMessage({ params: { answers } }),
      submitting: submitting ?? false
    })

    // payload 缺失时降级为文本兜底（一般不会发生，仅做防御）
    if (!card) {
      return renderAssistantText(content, followUps, false, onSendMessage)
    }

    return (
      <div className='animate-in slide-in-from-bottom-1 fade-in-0 flex w-full items-start gap-2 duration-200'>
        <AssistantAvatar />
        <div className='flex min-w-0 flex-1 flex-col items-start gap-2'>
          {card}
          {followUps && followUps.length > 0 ? (
            <FollowUpChips
              chips={followUps}
              onPick={(chip) => onSendMessage({ command: chip.command, params: chip.params })}
            />
          ) : null}
        </div>
      </div>
    )
  }

  // ----- 3) Assistant 纯文本：markdown + 可选 FollowUpChips；isLoading 时显示 typing 动画 -----
  return renderAssistantText(content, followUps, !!isLoading, onSendMessage)
}

/** AI 头像：用站点 logo（public/logo.svg）。 */
function AssistantAvatar() {
  return (
    <Avatar className='bg-primary/5 size-7 shrink-0'>
      <AvatarImage src='/logo.svg' alt='Noter AI' className='p-0.5' />
      <AvatarFallback className='bg-primary/10 text-primary text-xs font-semibold'>
        AI
      </AvatarFallback>
    </Avatar>
  )
}

// ---------------------------------------------------------------------------
// 工具：根据 messageType 渲染对应 Card
// ---------------------------------------------------------------------------

interface StructuredCardHandlers {
  onSubmitQuizConfig: (config: QuizConfig) => void
  onSubmitQuizAnswers: (answers: Record<number, unknown>) => void
  submitting: boolean
}

/** 按 messageType 分支渲染卡片；payload 不合预期返回 null 让上层降级为文本。 */
function renderStructuredCard(
  messageType: NonNullable<ChatMessageType['messageType']>,
  payload: unknown,
  handlers: StructuredCardHandlers
): React.ReactNode | null {
  if (!payload || typeof payload !== 'object') return null

  switch (messageType) {
    case 'BriefCard':
      return <BriefCard payload={payload as BriefPayload} />

    case 'TutorTurnCard':
      return <TutorTurnCard payload={payload as TutorTurnPayload} />

    case 'ExplainCard':
      return <ExplainCard payload={payload as ExplainPayload} />

    case 'ActionsCard':
      return <ActionsCard payload={payload as ActionsPayload} />

    case 'QuizConfigPrompt':
      return (
        <QuizConfigPrompt
          payload={payload as QuizConfigPayload}
          onSubmit={handlers.onSubmitQuizConfig}
          submitting={handlers.submitting}
        />
      )

    case 'QuizGroupCard':
      return (
        <QuizGroupCard
          payload={payload as QuizGroupPayload}
          onSubmit={handlers.onSubmitQuizAnswers}
          submitting={handlers.submitting}
        />
      )

    case 'QuizResultCard':
      return <QuizResultCard payload={payload as QuizResultPayload} />

    default: {
      // exhaustiveness check —— 未来新增 messageType 时编译报错提醒补齐分支
      const _exhaustive: never = messageType
      void _exhaustive
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// 工具：assistant 纯文本气泡（含可选 FollowUpChips）
// ---------------------------------------------------------------------------

function renderAssistantText(
  content: string,
  followUps: FollowUpChip[] | undefined,
  isLoading: boolean,
  onSendMessage: (payload: SendMessageInput) => void
): React.ReactNode {
  const showTyping = isLoading && content.length === 0
  return (
    <div className='animate-in slide-in-from-bottom-1 fade-in-0 flex w-full items-center gap-2 duration-200'>
      <AssistantAvatar />
      <div className='flex min-w-0 flex-1 flex-col items-start gap-2'>
        <div
          className={cn(
            'bg-muted text-muted-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm break-words',
            'prose prose-sm dark:prose-invert max-w-none',
            '[&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1',
            '[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-black/5 [&_pre]:p-2',
            '[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs'
          )}>
          {showTyping ? (
            <TypingDots />
          ) : content ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {isLoading ? <BlinkingCaret /> : null}
            </>
          ) : (
            <span className='text-muted-foreground/50'>...</span>
          )}
        </div>
        {followUps && followUps.length > 0 ? (
          <FollowUpChips
            chips={followUps}
            onPick={(chip) => onSendMessage({ command: chip.command, params: chip.params })}
          />
        ) : null}
      </div>
    </div>
  )
}

/** 三点跳动 typing 指示器：用 tailwind 自带 animate-bounce + 错峰 delay 实现。 */
function TypingDots() {
  return (
    <span
      role='status'
      aria-label='AI 正在思考'
      className='inline-flex items-center gap-1 py-1 align-middle'>
      <span className='bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]' />
      <span className='bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]' />
      <span className='bg-muted-foreground/60 h-1.5 w-1.5 animate-bounce rounded-full' />
    </span>
  )
}

/** 流式过程中的尾部光标，正文已开始累积时贴在末尾，提示 AI 还在输出。 */
function BlinkingCaret() {
  return (
    <span
      aria-hidden='true'
      className='bg-muted-foreground/70 ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse align-middle'
    />
  )
}
