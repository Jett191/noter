/**
 * SummaryTool 单测 + Property 7 数据完整性铺垫。
 *
 * 验证：
 *   - SQL 谓词强制 user_id / document_id / deleted=0
 *   - 任意失败均返回 null（让上层降级，不抛错）
 *   - todos / keyPoints / keywords 字段透传与规范化（Property 7）
 *
 * 实现策略：Vitest mock `../../src/db/client` 的 `getSupabaseServiceClient`，
 * 注入一个可观察的 fakeSupabase；不真连 Supabase。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

interface QueryCall {
  table: string
  columns: string
  filters: Array<{ field: string; value: unknown }>
}

const queryCalls: QueryCall[] = []

let mockData: unknown = null
let mockError: { message: string } | null = null

function makeFakeSupabase() {
  const builder: Record<string, unknown> = {}
  let current: QueryCall

  builder.from = (table: string) => {
    current = { table, columns: '', filters: [] }
    queryCalls.push(current)
    return builder
  }
  builder.select = (columns: string) => {
    current.columns = columns
    return builder
  }
  builder.eq = (field: string, value: unknown) => {
    current.filters.push({ field, value })
    return builder
  }
  builder.maybeSingle = async () => ({ data: mockData, error: mockError })
  builder.single = async () => ({ data: mockData, error: mockError })
  return builder
}

vi.mock('../../src/db/client', () => ({
  getSupabaseServiceClient: () => makeFakeSupabase()
}))

import { getSummary } from '../../src/tools/summary'

beforeEach(() => {
  queryCalls.length = 0
  mockData = null
  mockError = null
})

describe('SummaryTool.getSummary', () => {
  it('returns null when documentId is empty (short-circuit)', async () => {
    const result = await getSummary('', 'user-1')
    expect(result).toBeNull()
    // 短路不应触发 supabase 调用
    expect(queryCalls.length).toBe(0)
  })

  it('returns null when userId is empty (short-circuit)', async () => {
    const result = await getSummary('doc-1', '')
    expect(result).toBeNull()
    expect(queryCalls.length).toBe(0)
  })

  it('forces document_id + user_id + deleted=0 SQL predicates', async () => {
    mockData = {
      summary: 'doc summary',
      key_points: ['p1', 'p2'],
      keywords: ['k1'],
      suitable_scenarios: null,
      todos: ['t1', 't2', 't3']
    }
    await getSummary('doc-123', 'user-456')

    expect(queryCalls.length).toBe(1)
    const call = queryCalls[0]
    expect(call.table).toBe('document_summaries')
    // 必须同时包含 3 个谓词
    const fields = call.filters.map((f) => `${f.field}=${f.value}`)
    expect(fields).toContain('document_id=doc-123')
    expect(fields).toContain('user_id=user-456')
    expect(fields).toContain('deleted=0')
  })

  it('returns null on supabase error (no throw)', async () => {
    mockError = { message: 'connection refused' }
    const result = await getSummary('doc-1', 'user-1')
    expect(result).toBeNull()
  })

  it('returns null when row not found', async () => {
    mockData = null
    const result = await getSummary('doc-1', 'user-1')
    expect(result).toBeNull()
  })

  it('passes through todos / keyPoints / keywords (Property 7 data integrity)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 25 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 15 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
        async (todos, keyPoints, keywords) => {
          mockData = {
            summary: 's',
            key_points: keyPoints,
            keywords,
            suitable_scenarios: null,
            todos
          }
          const result = await getSummary('doc', 'user')
          expect(result).not.toBeNull()
          expect(result!.todos).toEqual(todos)
          expect(result!.keyPoints).toEqual(keyPoints)
          expect(result!.keywords).toEqual(keywords)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('normalizes non-array fields to []', async () => {
    mockData = {
      summary: null,
      key_points: 'not-an-array',
      keywords: { x: 1 },
      suitable_scenarios: null,
      todos: null
    }
    const result = await getSummary('doc', 'user')
    expect(result).not.toBeNull()
    expect(result!.keyPoints).toEqual([])
    expect(result!.keywords).toEqual([])
    expect(result!.todos).toEqual([])
    expect(result!.summary).toBeNull()
  })

  it('filters out non-string members from arrays', async () => {
    mockData = {
      summary: 's',
      key_points: ['ok', 123, null, 'good'],
      keywords: [],
      suitable_scenarios: null,
      todos: []
    }
    const result = await getSummary('doc', 'user')
    expect(result!.keyPoints).toEqual(['ok', 'good'])
  })
})
