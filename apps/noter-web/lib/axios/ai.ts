/**
 * Noter Agent —— 前端 AI 相关 HTTP 客户端封装。
 *
 * 端点对应：
 *   • POST   /api/ai/regenerate-summary   ←→ regenerateSummary(documentId)
 *   • POST   /api/ai/regenerate-mindmap   ←→ regenerateMindmap(documentId)
 *   • GET    /api/ai/sessions             ←→ getActiveSession(documentId)
 *   • PATCH  /api/ai/sessions/[id]        ←→ endSession(sessionId)
 *   • DELETE /api/ai/sessions/[id]        ←→ clearSession(sessionId)
 *
 * 关键约束（与 design.md → Security Considerations 对齐）：
 *   • `getActiveSession` 必须显式传入 `documentId` 作为查询参数；后端在缺失时返回 400。
 *     这里直接把它列为函数必填参数，从前端调用面就杜绝绕过。
 *   • `agent_skill_sessions` 表 RLS 仅允许 service_role；前端**只能**通过这些
 *     Route Handler 间接读写 session，且后端会在投递前剥离 `state.questions[i].correctAnswer`。
 *     因此这里的 `ActiveSession.state` 视为已脱敏的视图。
 *
 * 响应格式：成功时 `{ success: true, data, message? }`；
 * `http.*` 已通过 `response.data.data` 解包，因此各方法的泛型即解包后的 data 形状。
 */

import { http } from './client'
import type { SkillName } from '@/types/agent'

interface RegenerateResponse {
  success: boolean
  message?: string
}

/**
 * 当前活跃 session 的脱敏视图。
 *
 * 与 `packages/agent-runtime/src/types/session.ts:SkillSession` 保持字段同名，但
 * `state` 中的 `questions[i].correctAnswer` 已在 Route Handler 中剥离。
 * 由于 `state` 形状随 Skill 不同（/tutor 与 /quiz 各异），这里仅声明 `status` 必填、
 * 其余字段以索引签名透传给上层组件按 skill 收窄消费。
 */
export interface ActiveSession {
  id: string
  userId: string
  documentId: string
  skill: SkillName
  state: {
    status: 'active' | 'configuring' | 'answering' | 'graded' | 'ended' | 'interrupted'
    [key: string]: unknown
  }
  expiresAt: string
  createdAt: string
  updatedAt: string
}

/**
 * GET /api/ai/sessions 的响应数据。
 *
 * 命中 0 行时 `session` 为 null；命中 1 行时为脱敏后的 `ActiveSession`。
 */
export interface SessionResponse {
  session: ActiveSession | null
}

export const aiApi = {
  regenerateSummary: (documentId: string) =>
    http.post<RegenerateResponse>('api/ai/regenerate-summary', { documentId }),

  regenerateMindmap: (documentId: string) =>
    http.post<RegenerateResponse>('api/ai/regenerate-mindmap', { documentId }),

  /**
   * 查询当前用户当前文档的活跃 session。
   *
   * @param documentId 必填；后端在缺失或非法 UUID 时返回 400。
   * @returns 命中时返回脱敏后的 session；未命中时 `session: null`。
   */
  getActiveSession: (documentId: string) =>
    http.get<SessionResponse>('api/ai/sessions', { documentId }),

  /**
   * 退出 session（state.status='ended', expires_at=now()）。
   *
   * 后端成功时返回 `{ success: true, data: null, message: '会话已退出' }`；
   * `http.patch` 解包后为 `null`。
   */
  endSession: (sessionId: string) => http.patch<void>(`api/ai/sessions/${sessionId}`),

  /**
   * 软删 session（deleted=1）。
   *
   * 后端成功时返回 `{ success: true, data: null, message: '会话已删除' }`；
   * `http.delete` 解包后为 `null`。
   */
  clearSession: (sessionId: string) => http.delete<void>(`api/ai/sessions/${sessionId}`)
}
