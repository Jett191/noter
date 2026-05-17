/**
 * Property 10: Skill_Switch 顺序约束（orchestrator 编排，不是 Router 副作用）。
 *
 * 验证：
 *   - SessionTool.interrupt 失败（affectedRows = 0）→ 不启动新 Skill；SSE 发 error
 *   - SessionTool.interrupt 成功 → 顺序：interrupt → session_banner(interrupted)
 *     → content（系统提示）→ 启动新 Skill
 *   - Router 保持纯函数，无任何副作用断言（已在 skill-router.test.ts 验证）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SkillSession } from '../../src/types/session'
import type { SSEStreamHandle } from '../../src/sse/stream'

const sessionToolMocks = vi.hoisted(() => ({
  load: vi.fn(),
  interrupt: vi.fn(),
  upsert: vi.fn()
}))

vi.mock('../../src/tools/session', () => sessionToolMocks)

const skillMocks = vi.hoisted(() => ({
  runBriefSkill: vi.fn(async () => undefined),
  runTutorSkill: vi.fn(async () => undefined),
  runExplainSkill: vi.fn(async () => undefined),
  runActionsSkill: vi.fn(async () => undefined),
  runQuizSkill: vi.fn(async () => undefined)
}))

vi.mock('../../src/skills/brief', () => ({ runBriefSkill: skillMocks.runBriefSkill }))
vi.mock('../../src/skills/tutor', () => ({ runTutorSkill: skillMocks.runTutorSkill }))
vi.mock('../../src/skills/explain', () => ({ runExplainSkill: skillMocks.runExplainSkill }))
vi.mock('../../src/skills/actions', () => ({ runActionsSkill: skillMocks.runActionsSkill }))
vi.mock('../../src/skills/quiz', () => ({ runQuizSkill: skillMocks.runQuizSkill }))

import { runOrchestrator } from '../../src/orchestrator'

function makeOldSession(skill: SkillSession['skill']): SkillSession {
  return {
    id: 'old-sess',
    userId: 'u',
    documentId: 'd',
    skill,
    state: { status: 'active' },
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
}

interface RecordedEvent {
  event: string
  payload: Record<string, unknown>
}

function makeFakeSse(events: RecordedEvent[]): SSEStreamHandle {
  return {
    stream: new ReadableStream<Uint8Array>(),
    send: (e: { event: string } & Record<string, unknown>) => {
      const { event, ...rest } = e
      events.push({ event, payload: rest })
    },
    close: vi.fn(),
    error: vi.fn((err: unknown) => {
      events.push({ event: 'error', payload: { error: String(err) } })
    })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionToolMocks.load.mockResolvedValue(makeOldSession('/tutor'))
  sessionToolMocks.upsert.mockResolvedValue({})
})

describe('Property 10: Skill_Switch order constraints', () => {
  it('interrupt success → emits banner(interrupted) → content prompt → starts new skill', async () => {
    sessionToolMocks.interrupt.mockResolvedValue(1) // 1 行受影响

    const events: RecordedEvent[] = []
    const sse = makeFakeSse(events)

    await runOrchestrator(
      {
        userId: 'u',
        documentId: 'd',
        messages: [],
        command: '/brief', // 触发 Skill 切换：旧 /tutor → 新 /brief
        sessionId: 'old-sess'
      },
      sse
    )

    // 顺序约束：interrupt 必须在 banner 之前
    expect(sessionToolMocks.interrupt).toHaveBeenCalledTimes(1)
    expect(skillMocks.runBriefSkill).toHaveBeenCalledTimes(1)

    // SSE 事件顺序
    const sequence = events.map((e) => e.event)
    const interruptedIdx = sequence.findIndex(
      (_, i) => events[i].event === 'session_banner' && events[i].payload.status === 'interrupted'
    )
    const contentIdx = sequence.findIndex((s) => s === 'content')

    expect(interruptedIdx).toBeGreaterThanOrEqual(0)
    expect(contentIdx).toBeGreaterThanOrEqual(0)
    expect(interruptedIdx).toBeLessThan(contentIdx)
    // 系统提示文案应包含旧 Skill label
    expect(events[contentIdx].payload.content).toMatch(/已退出/)
  })

  it('interrupt failure (rows=0) → does NOT start new skill, SSE error', async () => {
    sessionToolMocks.interrupt.mockResolvedValue(0) // 失败

    const events: RecordedEvent[] = []
    const sse = makeFakeSse(events)

    await expect(
      runOrchestrator(
        {
          userId: 'u',
          documentId: 'd',
          messages: [],
          command: '/brief',
          sessionId: 'old-sess'
        },
        sse
      )
    ).rejects.toThrow(/failed to interrupt/)

    expect(skillMocks.runBriefSkill).not.toHaveBeenCalled()
    // SSE 应至少发出一次 error
    expect(sse.error).toHaveBeenCalled()
  })

  it('no switch case: same skill resume does NOT trigger interrupt', async () => {
    sessionToolMocks.interrupt.mockResolvedValue(1)
    sessionToolMocks.load.mockResolvedValue(makeOldSession('/tutor'))

    const events: RecordedEvent[] = []
    const sse = makeFakeSse(events)

    await runOrchestrator(
      {
        userId: 'u',
        documentId: 'd',
        messages: [{ role: 'user', content: '继续上一章' }],
        // 无 command + 已有 /tutor 活跃 session → mode=resume，无切换
        sessionId: 'old-sess'
      },
      sse
    )

    expect(sessionToolMocks.interrupt).not.toHaveBeenCalled()
    expect(skillMocks.runTutorSkill).toHaveBeenCalledTimes(1)
  })
})
