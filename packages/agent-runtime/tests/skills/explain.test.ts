/**
 * /explain 单测：
 *   1. 无 concept → SSE content 文本回复；不创建 session
 *   2. references 完整性（chunkId / headingPath / snippet 一致）
 *   3. 0 命中降级（LLM 通用解释 + 「⚠️ 此解释非来自当前文档：」标注）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChunkHit } from '../../src/types/tool'
import type { SSEStreamHandle } from '../../src/sse/stream'

// ChunkSearchTool 是 class，被 `new ChunkSearchTool(...)` 实例化使用
const chunkSearchInstance = vi.hoisted(() => ({
  vectorSearch: vi.fn(),
  keywordSearch: vi.fn(),
  hybridSearch: vi.fn()
}))
const ChunkSearchToolCtor = vi.hoisted(() => vi.fn().mockImplementation(() => chunkSearchInstance))

vi.mock('../../src/tools/chunk-search', () => ({
  ChunkSearchTool: ChunkSearchToolCtor
}))

const llmMock = vi.hoisted(() => ({
  completeJson: vi.fn(),
  complete: vi.fn()
}))

vi.mock('../../src/tools/llm', () => ({
  ...llmMock,
  LLMValidationError: class extends Error {}
}))

const sessionMock = vi.hoisted(() => ({
  load: vi.fn(),
  upsert: vi.fn(),
  interrupt: vi.fn()
}))
vi.mock('../../src/tools/session', () => sessionMock)

import { runExplainSkill } from '../../src/skills/explain'

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
  ChunkSearchToolCtor.mockImplementation(() => chunkSearchInstance)
})

describe('/explain: missing concept', () => {
  it('replies via SSE content text and does NOT create session', async () => {
    const events: RecordedEvent[] = []
    await runExplainSkill({ userId: 'u', documentId: 'd', params: {} }, makeSse(events))
    expect(events.length).toBe(1)
    expect(events[0].event).toBe('content')
    expect(String(events[0].payload.content)).toMatch(/想了解哪个概念/)
    // 不创建 session
    expect(sessionMock.upsert).not.toHaveBeenCalled()
    // 不调用任何检索
    expect(chunkSearchInstance.vectorSearch).not.toHaveBeenCalled()
    expect(chunkSearchInstance.keywordSearch).not.toHaveBeenCalled()
    // 不调 LLM
    expect(llmMock.complete).not.toHaveBeenCalled()
    expect(llmMock.completeJson).not.toHaveBeenCalled()
  })

  it('treats blank concept ("   ") as missing', async () => {
    const events: RecordedEvent[] = []
    await runExplainSkill(
      { userId: 'u', documentId: 'd', params: { concept: '   ' } },
      makeSse(events)
    )
    expect(events[0].event).toBe('content')
  })
})

describe('/explain: references integrity', () => {
  it('every reference.chunkId / headingPath / snippet matches search hits', async () => {
    const hits: ChunkHit[] = [
      {
        chunkId: 'c-vector-1',
        chunkIndex: 0,
        headingPath: ['第一章', '1.1'],
        content: 'vector hit content '.repeat(5),
        score: 0.9
      },
      {
        chunkId: 'c-keyword-1',
        chunkIndex: 5,
        headingPath: ['第二章'],
        content: 'keyword hit content',
        score: 0.5
      }
    ]
    chunkSearchInstance.vectorSearch.mockResolvedValue([hits[0]])
    chunkSearchInstance.keywordSearch.mockResolvedValue([hits[1]])
    llmMock.completeJson.mockResolvedValue({ markdown: '解释正文' })

    const events: RecordedEvent[] = []
    await runExplainSkill(
      { userId: 'u', documentId: 'd', params: { concept: 'RAG' } },
      makeSse(events)
    )

    const card = events.find((e) => e.event === 'structured_message')
    expect(card).toBeDefined()
    expect(card!.payload.messageType).toBe('ExplainCard')

    const payload = card!.payload.payload as {
      concept: string
      markdown: string
      references: Array<{ chunkId: string; headingPath: string[]; snippet: string }>
    }
    expect(payload.concept).toBe('RAG')
    expect(payload.markdown).toBe('解释正文')
    expect(payload.references.length).toBe(2)
    // 每条 reference 与 hit 一致
    expect(payload.references[0].chunkId).toBe(hits[0].chunkId)
    expect(payload.references[0].headingPath).toEqual(hits[0].headingPath)
    expect(payload.references[0].snippet.startsWith(hits[0].content.slice(0, 50))).toBe(true)
    expect(payload.references[1].chunkId).toBe(hits[1].chunkId)
    expect(payload.references[1].headingPath).toEqual(hits[1].headingPath)
  })

  it('deduplicates hits by chunkId across vector and keyword results', async () => {
    const same: ChunkHit = {
      chunkId: 'shared',
      chunkIndex: 0,
      headingPath: [],
      content: 'shared',
      score: 1
    }
    chunkSearchInstance.vectorSearch.mockResolvedValue([same])
    chunkSearchInstance.keywordSearch.mockResolvedValue([same]) // 同 chunkId
    llmMock.completeJson.mockResolvedValue({ markdown: 'm' })

    const events: RecordedEvent[] = []
    await runExplainSkill(
      { userId: 'u', documentId: 'd', params: { concept: 'X' } },
      makeSse(events)
    )

    const card = events.find((e) => e.event === 'structured_message')!
    const payload = card.payload.payload as { references: unknown[] }
    expect(payload.references.length).toBe(1)
  })
})

describe('/explain: 0-hit fallback', () => {
  it('emits markdown with "非来自当前文档" prefix and empty references', async () => {
    chunkSearchInstance.vectorSearch.mockResolvedValue([])
    chunkSearchInstance.keywordSearch.mockResolvedValue([])
    llmMock.complete.mockResolvedValue('这是一个通用解释')

    const events: RecordedEvent[] = []
    await runExplainSkill(
      { userId: 'u', documentId: 'd', params: { concept: 'rare-term' } },
      makeSse(events)
    )

    const card = events.find((e) => e.event === 'structured_message')!
    const payload = card.payload.payload as { markdown: string; references: unknown[] }
    expect(payload.markdown).toMatch(/非来自当前文档/)
    expect(payload.references).toEqual([])
    // LLM 走的是 complete（普通文本），不是 completeJson
    expect(llmMock.complete).toHaveBeenCalled()
    expect(llmMock.completeJson).not.toHaveBeenCalled()
  })
})

describe('/explain: follow_ups always emitted on success path', () => {
  it('appends [再深一点 / 关联概念有哪些] chips after card', async () => {
    chunkSearchInstance.vectorSearch.mockResolvedValue([])
    chunkSearchInstance.keywordSearch.mockResolvedValue([])
    llmMock.complete.mockResolvedValue('m')

    const events: RecordedEvent[] = []
    await runExplainSkill(
      { userId: 'u', documentId: 'd', params: { concept: 'X' } },
      makeSse(events)
    )

    const followUps = events.find((e) => e.event === 'follow_ups')
    expect(followUps).toBeDefined()
    const chips = followUps!.payload.chips as Array<{ command: string }>
    expect(chips.every((c) => c.command === '/explain')).toBe(true)
  })
})
