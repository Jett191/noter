/**
 * Noter Agent — 前端会话状态 store。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md`：
 *   • 多轮 Skill（/tutor、/quiz）的活跃 session 由 SSE `session_banner` 事件驱动；
 *     store 暴露 `applySessionBanner` 给 `useChatStream` Hook 在解析事件时调用。
 *   • SkillLaunchpad 的显隐：消息列表为空 → 显示；用户发出第一条消息后隐藏；
 *     重置（`resetForLaunchpad`）后再次显示。本期采用**显式字段** `launchpadVisible`，
 *     而不是 `messageList.length === 0` 推导，以便订阅更直观、避免 React 重渲染抖动。
 *   • 本期 `/explain` 缺参反问态**无状态**：后端通过 SSE `content` 文本提示，
 *     用户的下一条消息走正常意图分类，store **不**维护 `pendingSkill`。
 *
 * 与后端的对齐点：
 *   • `applySessionBanner` 接收的 banner payload 与 `SSEEvent` 中
 *     `{ event: 'session_banner' }` 分支同形（直接从 `@noter/agent-runtime` 类型抽取）。
 *   • `/quiz` configuring 阶段首次推送的 banner 携带 `sessionId`，store 据此记录用于
 *     后续 answering / graded 续签。其他场景 banner 不带 `sessionId`，
 *     store 保留既有 `id`（同 skill 时）以避免丢失续签上下文。
 */

import { create } from 'zustand'
import type { ChatMessage, SSEEvent, SkillName } from '@/types/agent'

/** SSE `session_banner` 事件 payload；从联合类型中抽取以保持与后端协议同步。 */
export type SessionBannerPayload = Extract<SSEEvent, { event: 'session_banner' }>

/**
 * 当前活跃多轮 session 在前端的视图。
 *
 * 字段语义：
 *   • `id`：sessionId，多轮续签必备。仅 `/quiz` configuring 首次 banner 会下发，
 *     其他场景需通过 `setActiveSession`（例如 `/api/ai/sessions` 响应）注入。
 *     `/tutor` 启动时 banner 不带 `sessionId`，因此 `id` 可能在首轮内为空。
 *   • `skill`：当前活跃 Skill。仅多轮 Skill 会出现在此（`/tutor`、`/quiz`）。
 *   • `status`：来自 banner 的状态；`'ended' | 'interrupted'` 不会出现在 store 中
 *     （收到这两种 banner 时 `applySessionBanner` 直接清空 `activeSession`）。
 *   • `progress`：当前进度，仅 `active` 状态时存在。
 */
export interface ActiveSession {
  id?: string
  skill: SkillName
  status: 'active'
  progress?: { current: number; total: number }
}

interface ChatSessionState {
  /** 当前活跃多轮 session；无活跃 session 时为 null */
  activeSession: ActiveSession | null
  /** 消息流（含用户与 assistant 的所有 ChatMessage） */
  messageList: ChatMessage[]
  /** SkillLaunchpad 是否显示；初始为 true，发出第一条消息后置 false */
  launchpadVisible: boolean

  /**
   * 直接设置 activeSession。
   *
   * `session === null` 时同时把 `launchpadVisible` 同步为
   * `messageList.length === 0`——session 主动结束 + 消息流为空时回到 Launchpad，
   * 已有消息时保持消息流可见。
   */
  setActiveSession: (session: ActiveSession | null) => void

  /** 单独清掉 activeSession，不动 messageList / launchpadVisible */
  clearSession: () => void

  /**
   * 追加一条消息；同时把 `launchpadVisible` 置 false 以隐藏 SkillLaunchpad。
   * 对应 Requirement 1.3：发出任意消息后立即隐藏 Launchpad。
   */
  appendMessage: (msg: ChatMessage) => void

  /**
   * 清空消息流并恢复到 Launchpad 视图。
   * 用于：用户在 SessionBanner 点退出二次确认后；或显式「重新开始」按钮。
   * 对应 Requirement 1.4。
   */
  resetForLaunchpad: () => void

  /**
   * 由 `useChatStream` Hook 在收到 SSE `session_banner` 事件时调用。
   *
   * 行为：
   *   • `status === 'active'`：建立 / 更新 activeSession。`payload.sessionId` 存在时
   *     直接采用；不存在但同 skill 已有活跃 session 时保留既有 `id`，避免误清。
   *   • `status === 'ended' | 'interrupted'`：清空 activeSession，让 SessionBanner
   *     立即隐藏（参见 Property 12 多轮 banner 一致性）。
   */
  applySessionBanner: (payload: SessionBannerPayload) => void
}

export const useChatSessionStore = create<ChatSessionState>((set) => ({
  activeSession: null,
  messageList: [],
  launchpadVisible: true,

  setActiveSession: (session) =>
    set((state) => ({
      activeSession: session,
      // 仅在主动清空 session 时根据消息流重新决定 Launchpad 显隐；
      // 设置为非 null 时不影响 launchpadVisible（消息流可能仍在）。
      launchpadVisible: session === null ? state.messageList.length === 0 : state.launchpadVisible
    })),

  clearSession: () => set({ activeSession: null }),

  appendMessage: (msg) =>
    set((state) => ({
      messageList: [...state.messageList, msg],
      launchpadVisible: false
    })),

  resetForLaunchpad: () =>
    set({
      messageList: [],
      activeSession: null,
      launchpadVisible: true
    }),

  applySessionBanner: (payload) =>
    set((state) => {
      if (payload.status === 'ended' || payload.status === 'interrupted') {
        return { activeSession: null }
      }
      // status === 'active'
      const existing = state.activeSession
      // sessionId 仅在 /quiz configuring 首次 banner 中下发；其他时机沿用既有 id。
      // 当 banner skill 与既有 skill 不同（极少见的内部状态切换）时，
      // 视为新 session，丢弃旧 id。
      const id = payload.sessionId ?? (existing?.skill === payload.skill ? existing.id : undefined)
      return {
        activeSession: {
          id,
          skill: payload.skill,
          status: 'active',
          progress: payload.progress
        }
      }
    })
}))
