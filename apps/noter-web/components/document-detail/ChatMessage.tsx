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
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
  const { role, messageType, payload, content, followUps } = message
  const isUser = role === 'user'

  // ----- 1) 用户消息：永远是纯文本气泡（user 不会下发结构化消息） -----
  if (isUser) {
    return (
      <div className='flex w-full justify-end'>
        <div className='bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap'>
          {content}
        </div>
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
      return renderAssistantText(content, followUps, onSendMessage)
    }

    return (
      <div className='flex w-full flex-col items-start gap-2'>
        {card}
        {followUps && followUps.length > 0 ? (
          <FollowUpChips
            chips={followUps}
            onPick={(chip) => onSendMessage({ command: chip.command, params: chip.params })}
          />
        ) : null}
      </div>
    )
  }

  // ----- 3) Assistant 纯文本：markdown + 可选 FollowUpChips -----
  return renderAssistantText(content, followUps, onSendMessage)
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
  onSendMessage: (payload: SendMessageInput) => void
): React.ReactNode {
  return (
    <div className='flex w-full flex-col items-start gap-2'>
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
      {followUps && followUps.length > 0 ? (
        <FollowUpChips
          chips={followUps}
          onPick={(chip) => onSendMessage({ command: chip.command, params: chip.params })}
        />
      ) : null}
    </div>
  )
}
