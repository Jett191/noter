/**
 * SSE 事件包络（与 design.md「事件清单」一致）。
 *
 * 协议层使用 **扁平字段**：每个事件 JSON 必含 `event` 字段，
 * 其余字段直接平铺在同层（如 `content` / `messageType`+`payload` /
 * `chips` / `skill`+`status`+`progress`+`sessionId` / `error`+`code`），
 * 序列化后形如：`data: {"event":"content","content":"..."}\n\n`。
 *
 * 终止帧 `data: [DONE]\n\n` **不是** SSE event，不在本联合类型内。
 */

import type { SkillName } from './skill'

/** SSE 事件类型枚举 */
export type SSEEventName =
  | 'content'
  | 'structured_message'
  | 'follow_ups'
  | 'session_banner'
  | 'error'

/** 结构化卡片 messageType 枚举 */
export type StructuredMessageType =
  | 'BriefCard'
  | 'TutorTurnCard'
  | 'ExplainCard'
  | 'ActionsCard'
  | 'QuizConfigPrompt'
  | 'QuizGroupCard'
  | 'QuizResultCard'

/** 文本流式片段 */
export interface ContentEvent {
  event: 'content'
  content: string
}

/** 结构化卡片 */
export interface StructuredMessageEvent<TPayload = unknown> {
  event: 'structured_message'
  messageType: StructuredMessageType
  payload: TPayload
}

/** 单轮 Skill 末尾追加的 follow-up chip 组 */
export interface FollowUpChip {
  label: string
  command: SkillName
  params?: Record<string, unknown>
}

export interface FollowUpsEvent {
  event: 'follow_ups'
  chips: FollowUpChip[]
}

/** 多轮 session 状态变化（/tutor、/quiz） */
export interface SessionBannerEvent {
  event: 'session_banner'
  skill: SkillName
  status: 'active' | 'ended' | 'interrupted'
  progress?: { current: number; total: number }
  /** 仅 /quiz configuring 阶段首次推送时存在 */
  sessionId?: string
}

/** 错误事件 */
export interface ErrorEvent {
  event: 'error'
  error: string
  code?: number
}

/** SSE 事件联合类型 */
export type SSEEvent =
  | ContentEvent
  | StructuredMessageEvent
  | FollowUpsEvent
  | SessionBannerEvent
  | ErrorEvent
