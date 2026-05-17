/**
 * /quiz 属性测试 + 单测：
 *   - Property 8 题组结构合法性（type / options / correctAnswer 类型约束）
 *   - Property 9 题量上限（count ∈ [1,10] 强制）
 *   - 配置阶段 banner 必须含 sessionId
 *   - 任意路径（首次出题 / sessionId 恢复 / 评分）SSE payload questions 不含 correctAnswer
 *   - stripCorrectAnswers 单测
 *   - parseAndValidateConfig 越界拒绝
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
const summaryMock = vi.hoisted(() => ({
  getSummary: vi.fn()
}))
const llmMock = vi.hoisted(() => ({
  completeJson: vi.fn(),
  complete: vi.fn()
}))

vi.mock('../../src/tools/session', () => sessionMock)
vi.mock('../../src/tools/outline', () => outlineMock)
vi.mock('../../src/tools/summary', () => summaryMock)
vi.mock('../../src/tools/llm', () => ({
  ...llmMock,
  LLMValidationError: class extends Error {
    rawOutput: string
    constructor(msg: string) {
      super(msg)
      this.name = 'LLMValidationError'
      this.rawOutput = ''
    }
  }
}))

import {
  runQuizSkill,
  stripCorrectAnswers,
  __quizInternals,
  type QuizQuestion
} from '../../src/skills/quiz'

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

function makeSession(state: Record<string, unknown>): SkillSession {
  return {
    id: 'sess-quiz',
    userId: 'u',
    documentId: 'd',
    skill: '/quiz',
    state: state as SkillSession['state'],
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  outlineMock.getOutline.mockResolvedValue([])
  outlineMock.getChapterChunks.mockResolvedValue([])
  summaryMock.getSummary.mockResolvedValue(null)
  sessionMock.load.mockResolvedValue(null)
  sessionMock.upsert.mockImplementation(async (input: { id?: string }) => ({
    id: input.id ?? 'new-quiz-sess',
    userId: 'u',
    documentId: 'd',
    skill: '/quiz',
    state: { status: 'configuring' },
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }))
})

// ===========================================================================
// stripCorrectAnswers helper
// ===========================================================================

describe('stripCorrectAnswers', () => {
  it('removes correctAnswer field from each question', () => {
    const input: QuizQuestion[] = [
      {
        index: 0,
        type: 'single',
        difficulty: 'recall',
        question: 'Q1',
        options: ['A', 'B'],
        correctAnswer: 'A'
      },
      {
        index: 1,
        type: 'multi',
        difficulty: 'understand',
        question: 'Q2',
        options: ['X', 'Y', 'Z'],
        correctAnswer: ['X', 'Y']
      },
      {
        index: 2,
        type: 'fill',
        difficulty: 'apply',
        question: 'Q3',
        correctAnswer: 'answer'
      }
    ]
    const result = stripCorrectAnswers(input)
    for (const q of result) {
      expect((q as Record<string, unknown>).correctAnswer).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(q, 'correctAnswer')).toBe(false)
    }
    // 其他字段保留
    expect(result[0].options).toEqual(['A', 'B'])
    expect(result[1].type).toBe('multi')
  })
})

// ===========================================================================
// parseAndValidateConfig
// ===========================================================================

describe('Property 9: parseAndValidateConfig enforces count ∈ [1, 10]', () => {
  const { parseAndValidateConfig } = __quizInternals

  it('rejects count outside [1, 10] across fuzz range [-5, 100]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 100 }), (count) => {
        const config = {
          questionTypes: ['single'],
          count
        }
        if (count >= 1 && count <= 10 && Number.isInteger(count)) {
          const result = parseAndValidateConfig(config)
          expect(result.count).toBe(count)
        } else {
          expect(() => parseAndValidateConfig(config)).toThrow()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('rejects non-integer count', () => {
    expect(() => parseAndValidateConfig({ questionTypes: ['single'], count: 5.5 })).toThrow()
  })

  it('rejects empty questionTypes', () => {
    expect(() => parseAndValidateConfig({ questionTypes: [], count: 3 })).toThrow()
  })

  it('rejects unknown question type', () => {
    expect(() => parseAndValidateConfig({ questionTypes: ['mystery'], count: 3 })).toThrow()
  })

  it('accepts difficulty=mixed (default) and all known values', () => {
    expect(parseAndValidateConfig({ questionTypes: ['fill'], count: 1 }).difficulty).toBeUndefined()
    expect(
      parseAndValidateConfig({ questionTypes: ['fill'], count: 1, difficulty: 'mixed' }).difficulty
    ).toBe('mixed')
    expect(
      parseAndValidateConfig({ questionTypes: ['fill'], count: 1, difficulty: 'recall' }).difficulty
    ).toBe('recall')
  })
})

// ===========================================================================
// Phase 1: configuring → emits banner with sessionId
// ===========================================================================

describe('/quiz configuring phase', () => {
  it('first session_banner event MUST contain sessionId', async () => {
    const events: RecordedEvent[] = []
    await runQuizSkill({ userId: 'u', documentId: 'd', params: {} }, makeSse(events))

    const banner = events.find((e) => e.event === 'session_banner')
    expect(banner).toBeDefined()
    expect(banner!.payload.sessionId).toBeDefined()
    expect(typeof banner!.payload.sessionId).toBe('string')
    expect(banner!.payload.skill).toBe('/quiz')
  })

  it('emits QuizConfigPrompt structured_message after banner', async () => {
    const events: RecordedEvent[] = []
    await runQuizSkill({ userId: 'u', documentId: 'd', params: {} }, makeSse(events))
    const card = events.find((e) => e.event === 'structured_message')
    expect(card!.payload.messageType).toBe('QuizConfigPrompt')

    const bannerIdx = events.findIndex((e) => e.event === 'session_banner')
    const cardIdx = events.findIndex((e) => e.event === 'structured_message')
    expect(bannerIdx).toBeLessThan(cardIdx) // banner 在卡前
  })

  it('inserts new session with state.status="configuring"', async () => {
    const events: RecordedEvent[] = []
    await runQuizSkill({ userId: 'u', documentId: 'd', params: {} }, makeSse(events))
    expect(sessionMock.upsert).toHaveBeenCalled()
    const arg = sessionMock.upsert.mock.calls[0][0] as { state: { status: string }; id?: string }
    expect(arg.state.status).toBe('configuring')
    expect(arg.id).toBeUndefined() // INSERT
  })
})

// ===========================================================================
// Phase 2: answering → strict count validation + Property 8 structure
// ===========================================================================

const validQuestionTypes = ['single', 'multi', 'fill', 'short'] as const

describe('/quiz answering: count validation', () => {
  it('rejects when count is out of [1, 10] (sse error + throw)', async () => {
    sessionMock.load.mockResolvedValue(makeSession({ status: 'configuring' }))

    const events: RecordedEvent[] = []
    await expect(
      runQuizSkill(
        {
          userId: 'u',
          documentId: 'd',
          sessionId: 'sess-quiz',
          params: { config: { questionTypes: ['single'], count: 11 } }
        },
        makeSse(events)
      )
    ).rejects.toThrow()

    // 应发 SSE error，不发 structured_message（不进 LLM 出题）
    expect(events.find((e) => e.event === 'error')).toBeDefined()
    expect(events.find((e) => e.event === 'structured_message')).toBeUndefined()
    expect(llmMock.completeJson).not.toHaveBeenCalled()
  })

  it('rejects count = 0 same way', async () => {
    sessionMock.load.mockResolvedValue(makeSession({ status: 'configuring' }))
    const events: RecordedEvent[] = []
    await expect(
      runQuizSkill(
        {
          userId: 'u',
          documentId: 'd',
          sessionId: 'sess-quiz',
          params: { config: { questionTypes: ['single'], count: 0 } }
        },
        makeSse(events)
      )
    ).rejects.toThrow()
    expect(events.find((e) => e.event === 'error')).toBeDefined()
  })
})

describe('Property 8 + 9: answering phase enforces structure & count', () => {
  it('valid config produces questions matching count, all sanitized + schema-valid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(validQuestionTypes as unknown as string[], { minLength: 1 }) as fc.Arbitrary<
          Array<(typeof validQuestionTypes)[number]>
        >,
        fc.integer({ min: 1, max: 10 }),
        async (types, count) => {
          // 重置 mocks
          vi.clearAllMocks()
          sessionMock.load.mockResolvedValue(makeSession({ status: 'configuring' }))
          sessionMock.upsert.mockResolvedValue({
            id: 'sess-quiz',
            userId: 'u',
            documentId: 'd',
            skill: '/quiz',
            state: { status: 'answering' },
            expiresAt: '2099',
            createdAt: '2024',
            updatedAt: '2024'
          })

          // 构造合法 LLM questions（恰好 count 道；按 types 循环挑题型）
          const questions = Array.from({ length: count }, (_, i) => {
            const t = types[i % types.length]
            const base = { stem: `Q${i}`, difficulty: 'recall' as const }
            switch (t) {
              case 'single':
                return {
                  type: 'single' as const,
                  ...base,
                  options: ['A', 'B', 'C'],
                  correctAnswer: 'A'
                }
              case 'multi':
                return {
                  type: 'multi' as const,
                  ...base,
                  options: ['X', 'Y', 'Z'],
                  correctAnswer: ['X', 'Y']
                }
              case 'fill':
                return { type: 'fill' as const, ...base, correctAnswer: 'ans' }
              case 'short':
                return { type: 'short' as const, ...base, correctAnswer: 'short ans' }
            }
          })
          llmMock.completeJson.mockResolvedValue({ questions })

          const events: RecordedEvent[] = []
          await runQuizSkill(
            {
              userId: 'u',
              documentId: 'd',
              sessionId: 'sess-quiz',
              params: { config: { questionTypes: types, count } }
            },
            makeSse(events)
          )

          const card = events.find(
            (e) => e.event === 'structured_message' && e.payload.messageType === 'QuizGroupCard'
          )
          expect(card).toBeDefined()
          const payload = card!.payload.payload as { questions: QuizQuestion[] }
          expect(payload.questions.length).toBe(count)

          // Property 8: 每题结构合法
          for (const q of payload.questions) {
            expect(['single', 'multi', 'fill', 'short']).toContain(q.type)
            if (q.type === 'single' || q.type === 'multi') {
              expect(Array.isArray(q.options)).toBe(true)
              expect((q.options ?? []).length).toBeGreaterThanOrEqual(2)
            } else {
              expect(q.options).toBeUndefined()
            }
            // 脱敏：questions 中不含 correctAnswer
            expect((q as Record<string, unknown>).correctAnswer).toBeUndefined()
          }
        }
      ),
      { numRuns: 15 }
    )
  })

  it('rejects when LLM returns wrong count (questions.length !== config.count)', async () => {
    sessionMock.load.mockResolvedValue(makeSession({ status: 'configuring' }))
    sessionMock.upsert.mockResolvedValue({
      id: 'sess-quiz',
      userId: 'u',
      documentId: 'd',
      skill: '/quiz',
      state: { status: 'answering' },
      expiresAt: '2099',
      createdAt: '2024',
      updatedAt: '2024'
    })
    // 请求 5 道，LLM 返回 3 道
    llmMock.completeJson.mockResolvedValue({
      questions: [
        { type: 'fill', stem: 'q', correctAnswer: 'a' },
        { type: 'fill', stem: 'q2', correctAnswer: 'a2' },
        { type: 'fill', stem: 'q3', correctAnswer: 'a3' }
      ]
    })

    const events: RecordedEvent[] = []
    await expect(
      runQuizSkill(
        {
          userId: 'u',
          documentId: 'd',
          sessionId: 'sess-quiz',
          params: { config: { questionTypes: ['fill'], count: 5 } }
        },
        makeSse(events)
      )
    ).rejects.toThrow(/expected 5/)
    expect(events.find((e) => e.event === 'error')).toBeDefined()
  })
})

// ===========================================================================
// Phase 3: graded
// ===========================================================================

describe('/quiz graded phase: scoring + sanitization', () => {
  it('grades single-choice answers with trim + case-insensitive comparison', async () => {
    const persistedQuestions: QuizQuestion[] = [
      {
        index: 0,
        type: 'single',
        difficulty: 'recall',
        question: 'Q1',
        options: ['A', 'B'],
        correctAnswer: 'A'
      },
      {
        index: 1,
        type: 'fill',
        difficulty: 'recall',
        question: 'Q2',
        correctAnswer: 'hello'
      }
    ]
    sessionMock.load.mockResolvedValue(
      makeSession({
        status: 'answering',
        questions: persistedQuestions,
        config: { questionTypes: ['single', 'fill'], count: 2 }
      })
    )

    const events: RecordedEvent[] = []
    await runQuizSkill(
      {
        userId: 'u',
        documentId: 'd',
        sessionId: 'sess-quiz',
        params: { answers: { 0: 'A', 1: '  HELLO  ' } }
      },
      makeSse(events)
    )

    const card = events.find(
      (e) => e.event === 'structured_message' && e.payload.messageType === 'QuizResultCard'
    )
    expect(card).toBeDefined()
    const payload = card!.payload.payload as {
      results: Array<{ correct: boolean; questionIndex: number }>
      score: number
    }
    expect(payload.results).toHaveLength(2)
    expect(payload.results.every((r) => r.correct)).toBe(true)
    expect(payload.score).toBe(100)
  })

  it('produces score in [0, 100]', async () => {
    sessionMock.load.mockResolvedValue(
      makeSession({
        status: 'answering',
        questions: [
          {
            index: 0,
            type: 'fill',
            difficulty: 'recall',
            question: 'Q',
            correctAnswer: 'right'
          },
          {
            index: 1,
            type: 'fill',
            difficulty: 'recall',
            question: 'Q',
            correctAnswer: 'right'
          }
        ]
      })
    )
    const events: RecordedEvent[] = []
    await runQuizSkill(
      {
        userId: 'u',
        documentId: 'd',
        sessionId: 'sess-quiz',
        params: { answers: { 0: 'right', 1: 'WRONG' } }
      },
      makeSse(events)
    )
    const card = events.find(
      (e) => e.event === 'structured_message' && e.payload.messageType === 'QuizResultCard'
    )!
    const payload = card.payload.payload as { score: number }
    expect(payload.score).toBe(50)
  })
})

// ===========================================================================
// 兜底：reload (configuring) 路径同样脱敏
// ===========================================================================

describe('/quiz resume path: questions never expose correctAnswer', () => {
  it('answering reload re-emits QuizGroupCard sanitized', async () => {
    const persistedQuestions: QuizQuestion[] = [
      {
        index: 0,
        type: 'single',
        difficulty: 'recall',
        question: 'Q1',
        options: ['A', 'B'],
        correctAnswer: 'A'
      }
    ]
    sessionMock.load.mockResolvedValue(
      makeSession({
        status: 'answering',
        questions: persistedQuestions,
        userAnswers: {}
      })
    )

    const events: RecordedEvent[] = []
    // 没有 params.config 也没有 params.answers → 走兜底 resumeCurrentPhase
    await runQuizSkill(
      {
        userId: 'u',
        documentId: 'd',
        sessionId: 'sess-quiz',
        params: {}
      },
      makeSse(events)
    )

    const card = events.find(
      (e) => e.event === 'structured_message' && e.payload.messageType === 'QuizGroupCard'
    )
    expect(card).toBeDefined()
    const payload = card!.payload.payload as { questions: QuizQuestion[] }
    for (const q of payload.questions) {
      expect((q as Record<string, unknown>).correctAnswer).toBeUndefined()
    }
  })
})
