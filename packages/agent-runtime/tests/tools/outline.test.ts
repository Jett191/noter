/**
 * OutlineTool 单测：
 *   - compressChapterChunks token 切分行为：≤ maxTokens 全量；超长走代表性采样；
 *     单 chunk 极长 → needsLLMSummary
 *   - getOutline / getChapterChunks / getMarkdownPrefix 谓词强制
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChunkHit } from '../../src/types/tool'

interface QueryCall {
  table: string
  columns: string
  filters: Array<{ field: string; value: unknown }>
  ordered?: { column: string; ascending: boolean }
}

const queryCalls: QueryCall[] = []
let mockData: unknown = null

function makeFakeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  let current!: QueryCall

  builder.from = (table: string) => {
    current = { table, columns: '', filters: [] }
    queryCalls.push(current)
    return builder
  }
  builder.select = (cols: string) => {
    current.columns = cols
    return builder
  }
  builder.eq = (field: string, value: unknown) => {
    current.filters.push({ field, value })
    return builder
  }
  builder.order = (column: string, opts: { ascending: boolean }) => {
    current.ordered = { column, ascending: opts.ascending }
    // order 后通常返回数组（await）
    ;(builder as { then?: unknown }).then = (
      resolve: (v: { data: unknown; error: null }) => unknown
    ) => resolve({ data: mockData, error: null })
    return builder
  }
  builder.maybeSingle = async () => ({ data: mockData, error: null })
  return builder
}

vi.mock('../../src/db/client', () => ({
  getSupabaseServiceClient: () => makeFakeBuilder()
}))

import {
  compressChapterChunks,
  getOutline,
  getChapterChunks,
  getMarkdownPrefix
} from '../../src/tools/outline'

beforeEach(() => {
  queryCalls.length = 0
  mockData = null
})

function makeChunk(idx: number, content: string): ChunkHit {
  return {
    chunkId: `c${idx}`,
    chunkIndex: idx,
    headingPath: ['ch1'],
    content,
    score: 1
  }
}

describe('compressChapterChunks', () => {
  it('returns full content when total tokens ≤ maxTokens', () => {
    // estimateTokens = ceil(chars / 3)；100 字符 ≈ 34 token，10 块 ≈ 340 token
    const chunks = Array.from({ length: 5 }, (_, i) => makeChunk(i, 'a'.repeat(60)))
    const result = compressChapterChunks(chunks, 8000)
    expect(result.needsLLMSummary).toBe(false)
    expect(result.content).toContain('a'.repeat(60))
    // 5 块全部拼接，含 4 个 \n\n 分隔符
    expect(result.content.split('\n\n').length).toBeGreaterThanOrEqual(5)
  })

  it('returns empty content when chunks is empty', () => {
    const result = compressChapterChunks([], 5000)
    expect(result.content).toBe('')
    expect(result.needsLLMSummary).toBe(false)
  })

  it('falls back to representative sampling when total tokens > maxTokens', () => {
    // 50 块 × 600 字符 ≈ 50 × 200 = 10000 token，超 maxTokens=4000
    const chunks = Array.from({ length: 50 }, (_, i) => makeChunk(i, 'x'.repeat(600)))
    const result = compressChapterChunks(chunks, 4000)
    expect(result.needsLLMSummary).toBe(false)
    // 必须包含省略号提示
    expect(result.content).toMatch(/\[\.\.\..*?\]/)
  })

  it('signals needsLLMSummary when no head/tail/middle samples fit', () => {
    // 单 chunk 极长（20000 字符 ≈ 6667 token）：
    //   - total > maxTokens 触发采样分支
    //   - head budget=1500、tail budget=1500 都装不下 6667 token → head/tail 为 []
    //   - middle = [chunk]，middleBudget=5000；sampleEvenly 中 6667 > 5000 → continue 跳过
    //   - 三段都空 → needsLLMSummary=true
    const chunks = [makeChunk(0, 'y'.repeat(20000))]
    const result = compressChapterChunks(chunks, 4000)
    expect(result.needsLLMSummary).toBe(true)
    expect(result.content).toBe('')
  })
})

describe('getOutline', () => {
  it('forces document_id + user_id + deleted=0 predicates', async () => {
    mockData = { outline: [] }
    await getOutline('doc-1', 'user-1')
    expect(queryCalls[0].table).toBe('document_contents')
    const fields = queryCalls[0].filters.map((f) => `${f.field}=${f.value}`)
    expect(fields).toContain('document_id=doc-1')
    expect(fields).toContain('user_id=user-1')
    expect(fields).toContain('deleted=0')
  })

  it('returns null when outline is missing or non-array', async () => {
    mockData = null
    expect(await getOutline('d', 'u')).toBeNull()
    mockData = { outline: 'not-array' }
    expect(await getOutline('d', 'u')).toBeNull()
  })

  it('enriches each node with headingPath built from ancestor titles', async () => {
    mockData = {
      outline: [
        {
          id: 'h1-a',
          level: 1,
          title: 'Chapter 1',
          children: [{ id: 'h2-a', level: 2, title: 'Section 1.1', children: [] }]
        }
      ]
    }
    const outline = await getOutline('d', 'u')
    expect(outline).not.toBeNull()
    expect(outline![0].headingPath).toEqual(['Chapter 1'])
    expect(outline![0].children[0].headingPath).toEqual(['Chapter 1', 'Section 1.1'])
  })
})

describe('getChapterChunks', () => {
  it('forces predicates and orders by chunk_index ascending', async () => {
    mockData = []
    await getChapterChunks('d', 'u', ['chap'])
    const call = queryCalls[0]
    expect(call.table).toBe('document_chunks')
    const fields = call.filters.map((f) => `${f.field}=${f.value}`)
    expect(fields).toContain('document_id=d')
    expect(fields).toContain('user_id=u')
    expect(fields).toContain('deleted=0')
    expect(call.ordered).toEqual({ column: 'chunk_index', ascending: true })
  })

  it('filters by heading_path prefix (JS-side multi-level match)', async () => {
    mockData = [
      { id: 'c1', chunk_index: 0, content: 'a', heading_path: ['ch1', 'sec1'] },
      { id: 'c2', chunk_index: 1, content: 'b', heading_path: ['ch1', 'sec2'] },
      { id: 'c3', chunk_index: 2, content: 'c', heading_path: ['ch2'] } // 不应被 .eq 过滤掉，但 JS 前缀过滤会剔除
    ]
    const hits = await getChapterChunks('d', 'u', ['ch1', 'sec1'])
    expect(hits.length).toBe(1)
    expect(hits[0].chunkId).toBe('c1')
  })
})

describe('getMarkdownPrefix', () => {
  it('returns null when row absent', async () => {
    mockData = null
    expect(await getMarkdownPrefix('d', 'u', 100)).toBeNull()
  })

  it('returns prefix slice up to charLimit', async () => {
    mockData = { markdown_content: 'hello world this is markdown' }
    const result = await getMarkdownPrefix('d', 'u', 5)
    expect(result).toBe('hello')
  })

  it('returns full content when shorter than charLimit', async () => {
    mockData = { markdown_content: 'short' }
    expect(await getMarkdownPrefix('d', 'u', 100)).toBe('short')
  })

  it('throws on negative charLimit', async () => {
    await expect(getMarkdownPrefix('d', 'u', -1)).rejects.toThrow(/non-negative/)
  })
})
