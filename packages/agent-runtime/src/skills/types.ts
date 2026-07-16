/**
 * Skill Handler 公共类型占位。
 *
 * 详细签名由 Task 4.1 / 6.x 补全。
 */

import type { SSEStreamHandle } from '../sse/stream'
import type { SkillName } from '../types/skill'

export interface SkillContext {
  userId: string
  documentId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  params: Record<string, unknown>
  sessionId?: string
  sse: SSEStreamHandle
  abortSignal?: AbortSignal
}

export interface SkillHandler {
  name: SkillName
  handle(ctx: SkillContext): Promise<void>
}
