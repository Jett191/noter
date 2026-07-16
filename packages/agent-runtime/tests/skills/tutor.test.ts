/**
 * /tutor 单测 + Property 12 多轮 banner 一致性。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import type { SSEStreamHandle } from '../../src/sse/stream'
import type { SkillSession } from '../../src/types/session'

const sessionMock = vi.hoisted(() => ({
  load: vi.fn(),
  upsert: vi.fn(),
  interrupt: vi.fn()
}))
const outlineMock = vi.hoisted(() => ({
  getOutline: vi.fn(),
  getChapterChunks: vi.fn(),
  compressChapterChunks: vi.fn(),
  getMarkdownPrefix: vi.fn()
}))
const llmMock = vi.hoisted(() => ({
  completeJson: vi.fn(),
  complete: vi.fn()
}))

vi.mock('../../src/tools/session', () => sessionMock)
vi.mock('../../src/tools/outline', () => outlineMock)
vi.mock('../../src/tools/llm', () => ({
  ...llmMock,
  LLMValidationError: class extends Error {},
  LLMTimeoutError: class extends Error {
    constructor(msg = 't') {
      super(msg)
      this.name = 'LLMTimeoutError'
    }
  }
}))

import { runTutorSkill } from '../../src/skills/tutor'

interface RecordedEvent {
  event: string
  payload: Record<string, unknown>
}

function makeSse(events: RecordedEvent[]): SSEStreamHandle {
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

const fakeChapters = [
  { id: 'h1', level: 1, title: 'Ch1', headingPath: ['Ch1'], children: [] },
  { id: 'h2', level: 1, title: 'Ch2', headingPath: ['Ch2'], children: [] },
  { id: 'h3', level: 1, title: 'Ch3', headingPath: ['Ch3'], children: [] }
]

function makeSession(state: Record<string, unknown>): SkillSession {
  return {
    id: 'sess-1',
    userId: 'u',
    documentId: 'd',
    skill: '/tutor',
    state: state as SkillSession['state'],
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  outlineMock.getOutline.mockResolvedValue(fakeChapters)
  outlineMock.getChapterChunks.mockResolvedValue([
    { chunkId: 'c0', chunkIndex: 0, headingPath: ['Ch1'], content: 'short content', score: 1 }
  ])
  outlineMock.compressChapterChunks.mockReturnValue({
    content: 'compressed',
    needsLLMSummary: false
  })
  outlineMock.getMarkdownPrefix.mockResolvedValue(null)
  sessionMock.upsert.mockImplementation(async (input: { id?: string }) => ({
    id: input.id ?? 'new-sess',
    userId: 'u',
    documentId: 'd',
    skill: '/tutor',
    state: { status: 'active' },
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }))
})

describe('/tutor: fresh start', () => {
  it('emits session_banner active(progress 1/N) → TutorTurnCard, upserts session', async () => {
    llmMock.completeJson.mockResolvedValue({
      explanation: '本章核心讲解...',
      question: '本章关键观点是？'
    })
    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [],
        params: {},
        mode: 'fresh'
      },
      makeSse(events)
    )

    expect(sessionMock.upsert).toHaveBeenCalled()
    const banner = events.find((e) => e.event === 'session_banner' && e.payload.status === 'active')
    expect(banner).toBeDefined()
    const progress = banner!.payload.progress as { current: number; total: number }
    expect(progress.current).toBe(1)
    expect(progress.total).toBe(3)

    const card = events.find((e) => e.event === 'structured_message')
    expect(card!.payload.messageType).toBe('TutorTurnCard')
    const payload = card!.payload.payload as { chapterIndex: number; totalChapters: number }
    expect(payload.chapterIndex).toBe(0)
    expect(payload.totalChapters).toBe(3)
  })

  it('does NOT emit follow_ups in fresh tutor turn (multi-turn skill)', async () => {
    llmMock.completeJson.mockResolvedValue({
      explanation: 'e',
      question: 'q'
    })
    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [],
        params: {},
        mode: 'fresh'
      },
      makeSse(events)
    )
    expect(events.find((e) => e.event === 'follow_ups')).toBeUndefined()
  })

  it('falls back to virtual chapters when outline missing but markdown exists', async () => {
    outlineMock.getOutline.mockResolvedValue(null)
    outlineMock.getMarkdownPrefix.mockResolvedValue('a'.repeat(5000))
    llmMock.completeJson.mockResolvedValue({ explanation: 'e', question: 'q' })

    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [],
        params: {},
        mode: 'fresh'
      },
      makeSse(events)
    )

    const banner = events.find((e) => e.event === 'session_banner')!
    expect((banner.payload.progress as { total: number }).total).toBe(5)
  })

  it('throws when both outline and markdown are empty', async () => {
    outlineMock.getOutline.mockResolvedValue(null)
    outlineMock.getMarkdownPrefix.mockResolvedValue('')

    const events: RecordedEvent[] = []
    await expect(
      runTutorSkill(
        {
          userId: 'u',
          documentId: 'd',
          messages: [],
          params: {},
          mode: 'fresh'
        },
        makeSse(events)
      )
    ).rejects.toThrow(/无法启动/)
  })
})

describe('/tutor: resume chapter advancement', () => {
  it('"good" assessment advances to next chapter', async () => {
    // 当前 state: chapter 0；mock LLM 评估 good → 推进到 chapter 1
    sessionMock.load.mockResolvedValue(undefined) // resume 不依赖 load
    llmMock.completeJson
      .mockResolvedValueOnce({ assessment: 'good' }) // 评估上一轮
      .mockResolvedValueOnce({ explanation: 'next', question: 'q2' }) // 下一章 turn

    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [{ role: 'user', content: '我的回答' }],
        params: {},
        mode: 'resume',
        activeSession: makeSession({
          status: 'active',
          currentChapterIndex: 0,
          totalChapters: 3,
          currentTopic: 'Ch1',
          understanding: 50,
          exchangeHistory: [],
          pendingQuestion: 'q1'
        })
      },
      makeSse(events)
    )

    const banner = events.find((e) => e.event === 'session_banner' && e.payload.status === 'active')
    expect(banner).toBeDefined()
    expect((banner!.payload.progress as { current: number }).current).toBe(2) // 1-based
  })

  it('"partial" assessment retries on same chapter', async () => {
    llmMock.completeJson
      .mockResolvedValueOnce({ assessment: 'partial' })
      .mockResolvedValueOnce({ explanation: 'retry', question: 'q-retry' })

    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [{ role: 'user', content: '部分对' }],
        params: {},
        mode: 'resume',
        activeSession: makeSession({
          status: 'active',
          currentChapterIndex: 1,
          totalChapters: 3,
          currentTopic: 'Ch2',
          understanding: 50,
          exchangeHistory: [],
          pendingQuestion: 'qx'
        })
      },
      makeSse(events)
    )

    const banner = events.find((e) => e.event === 'session_banner' && e.payload.status === 'active')
    expect((banner!.payload.progress as { current: number }).current).toBe(2) // 仍在 chapter 1（1-based 显示 2）
  })

  it('emits ended banner when last chapter completed with "good"', async () => {
    llmMock.completeJson.mockResolvedValueOnce({ assessment: 'good' })

    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [{ role: 'user', content: 'done' }],
        params: {},
        mode: 'resume',
        activeSession: makeSession({
          status: 'active',
          currentChapterIndex: 2, // 最后一章（0-based）
          totalChapters: 3,
          currentTopic: 'Ch3',
          understanding: 50,
          exchangeHistory: [],
          pendingQuestion: 'q-last'
        })
      },
      makeSse(events)
    )

    const ended = events.find((e) => e.event === 'session_banner' && e.payload.status === 'ended')
    expect(ended).toBeDefined()
    // 不再发新的 active banner / TutorTurnCard
    const turnCard = events.find(
      (e) => e.event === 'structured_message' && e.payload.messageType === 'TutorTurnCard'
    )
    expect(turnCard).toBeUndefined()
  })
})

describe('/tutor: exit handling', () => {
  it('params.exit=true => sets state.status=ended, emits ended banner, no turn card', async () => {
    const events: RecordedEvent[] = []
    await runTutorSkill(
      {
        userId: 'u',
        documentId: 'd',
        messages: [],
        params: { exit: true },
        mode: 'resume',
        activeSession: makeSession({
          status: 'active',
          currentChapterIndex: 1,
          totalChapters: 3,
          currentTopic: 'Ch2',
          understanding: 50,
          exchangeHistory: []
        })
      },
      makeSse(events)
    )

    expect(sessionMock.upsert).toHaveBeenCalled()
    const upsertCall = sessionMock.upsert.mock.calls[0][0] as { state: { status: string } }
    expect(upsertCall.state.status).toBe('ended')

    const ended = events.find((e) => e.event === 'session_banner' && e.payload.status === 'ended')
    expect(ended).toBeDefined()
    const turnCard = events.find((e) => e.event === 'structured_message')
    expect(turnCard).toBeUndefined()
  })
})

describe('Property 12: multi-turn banner consistency', () => {
  it('non-active state in resume → emits banner ending only, no active banner', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('ended', 'interrupted'), async (status) => {
        const events: RecordedEvent[] = []
        await runTutorSkill(
          {
            userId: 'u',
            documentId: 'd',
            messages: [{ role: 'user', content: 'x' }],
            params: {},
            mode: 'resume',
            activeSession: makeSession({
              status,
              currentChapterIndex: 0,
              totalChapters: 3,
              currentTopic: 'Ch1',
              understanding: 50,
              exchangeHistory: []
            })
          },
          makeSse(events)
        )
        // 应该有恰好 1 条 session_banner，且 status 与输入一致（不再下发 active）
        const banners = events.filter((e) => e.event === 'session_banner')
        expect(banners.length).toBe(1)
        expect(banners[0].payload.status).toBe(status)
        // 不应启动新的章节
        expect(sessionMock.upsert).not.toHaveBeenCalled()
      }),
      { numRuns: 10 }
    )
  })
})
