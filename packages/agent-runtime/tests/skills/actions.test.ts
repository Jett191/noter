/**
 * /actions Property 7：数据完整性 + 数量上限。
 *
 * 验证：
 *   - 输出 todos.length ≤ 20、conceptsToLearn ≤ 8、readingSuggestions ≤ 5
 *   - 不调用 ChunkSearchTool 任何向量方法
 *   - summary 缺失时走 LLM 现场提取，不发 SSE error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import type { SSEStreamHandle } from '../../src/sse/stream'

const summaryMock = vi.hoisted(() => ({ getSummary: vi.fn() }))
const outlineMock = vi.hoisted(() => ({
  getOutline: vi.fn(),
  getChapterChunks: vi.fn()
}))
const llmMock = vi.hoisted(() => ({
  completeJson: vi.fn(),
  complete: vi.fn()
}))
const chunkSearchMock = vi.hoisted(() => ({
  vectorSearch: vi.fn(),
  keywordSearch: vi.fn(),
  hybridSearch: vi.fn(),
  ChunkSearchTool: vi.fn()
}))

vi.mock('../../src/tools/summary', () => summaryMock)
vi.mock('../../src/tools/outline', () => outlineMock)
vi.mock('../../src/tools/llm', () => ({
  ...llmMock,
  LLMValidationError: class extends Error {}
}))
vi.mock('../../src/tools/chunk-search', () => chunkSearchMock)

import { runActionsSkill } from '../../src/skills/actions'

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

beforeEach(() => {
  vi.clearAllMocks()
  outlineMock.getOutline.mockResolvedValue([])
  outlineMock.getChapterChunks.mockResolvedValue([])
})

describe('Property 7: count limits enforced', () => {
  it('clamps output arrays to ≤20/8/5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 25 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 5 }),
        async (todosFromSummary, todosLen, conceptsLen, readingsLen) => {
          summaryMock.getSummary.mockResolvedValue({
            summary: 's',
            keyPoints: [],
            keywords: [],
            suitableScenarios: null,
            todos: todosFromSummary
          })
          // LLM 返回合法但接近上限（schema 强制 ≤ 上限，slice 仍二次截断）
          llmMock.completeJson.mockResolvedValue({
            todos: Array.from({ length: todosLen }, (_, i) => `t${i}`),
            conceptsToLearn: Array.from({ length: conceptsLen }, (_, i) => `c${i}`),
            readingSuggestions: Array.from({ length: readingsLen }, (_, i) => `r${i}`)
          })

          const events: RecordedEvent[] = []
          await runActionsSkill({ userId: 'u', documentId: 'd' }, makeSse(events))

          const card = events.find((e) => e.event === 'structured_message')
          expect(card).toBeDefined()
          const payload = card!.payload.payload as {
            todos: string[]
            conceptsToLearn: string[]
            readingSuggestions: string[]
          }
          expect(payload.todos.length).toBeLessThanOrEqual(20)
          expect(payload.conceptsToLearn.length).toBeLessThanOrEqual(8)
          expect(payload.readingSuggestions.length).toBeLessThanOrEqual(5)
        }
      ),
      { numRuns: 30 }
    )
  })
})

describe('/actions: never invokes ChunkSearchTool vector/keyword/hybrid methods', () => {
  it('only uses SummaryTool + OutlineTool', async () => {
    summaryMock.getSummary.mockResolvedValue({
      summary: 's',
      keyPoints: [],
      keywords: [],
      suitableScenarios: null,
      todos: []
    })
    llmMock.completeJson.mockResolvedValue({
      todos: [],
      conceptsToLearn: [],
      readingSuggestions: []
    })

    const events: RecordedEvent[] = []
    await runActionsSkill({ userId: 'u', documentId: 'd' }, makeSse(events))

    expect(chunkSearchMock.vectorSearch).not.toHaveBeenCalled()
    expect(chunkSearchMock.keywordSearch).not.toHaveBeenCalled()
    expect(chunkSearchMock.hybridSearch).not.toHaveBeenCalled()
    expect(chunkSearchMock.ChunkSearchTool).not.toHaveBeenCalled()
  })
})

describe('/actions: degraded path when summary missing', () => {
  it('does NOT emit SSE error when summary returns null', async () => {
    summaryMock.getSummary.mockResolvedValue(null)
    outlineMock.getOutline.mockResolvedValue([
      { id: '1', level: 1, title: 'C1', headingPath: ['C1'], children: [] }
    ])
    outlineMock.getChapterChunks.mockResolvedValue([
      { chunkId: 'c0', chunkIndex: 0, headingPath: ['C1'], content: 'first', score: 1 }
    ])
    llmMock.completeJson.mockResolvedValue({
      todos: ['x'],
      conceptsToLearn: [],
      readingSuggestions: []
    })

    const events: RecordedEvent[] = []
    await runActionsSkill({ userId: 'u', documentId: 'd' }, makeSse(events))
    const errorEvents = events.filter((e) => e.event === 'error')
    expect(errorEvents).toHaveLength(0)
  })
})

describe('/actions: follow_ups attached', () => {
  it('appends [考考我 → /quiz, 开始私教 → /tutor]', async () => {
    summaryMock.getSummary.mockResolvedValue(null)
    llmMock.completeJson.mockResolvedValue({
      todos: [],
      conceptsToLearn: [],
      readingSuggestions: []
    })
    const events: RecordedEvent[] = []
    await runActionsSkill({ userId: 'u', documentId: 'd' }, makeSse(events))
    const followUps = events.find((e) => e.event === 'follow_ups')
    const chips = followUps!.payload.chips as Array<{ command: string }>
    const cmds = chips.map((c) => c.command)
    expect(cmds).toContain('/quiz')
    expect(cmds).toContain('/tutor')
  })
})
