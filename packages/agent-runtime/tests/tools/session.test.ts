/**
 * SessionTool 单测：
 *   - load() 谓词强制 + 不命中返回 null
 *   - upsert() INSERT vs UPDATE 分支
 *   - interrupt() 受影响行数 0 / 1（关键 spec：必须 affectedRows ≥ 1 才算成功）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

interface QueryRecorder {
  table?: string
  op?: 'select' | 'insert' | 'update'
  filters: Array<{ field: string; value: unknown }>
  inserted?: unknown
  updated?: unknown
  selectedColumns?: string
}

let recorder: QueryRecorder
let mockSelectData: unknown = null
let mockUpdateData: unknown[] | null = null
let mockInsertData: unknown = null
let mockError: { message: string; code?: string } | null = null

function makeFakeBuilder() {
  const b: Record<string, unknown> = {}
  b.select = (cols: string) => {
    recorder.selectedColumns = cols
    return b
  }
  b.eq = (field: string, value: unknown) => {
    recorder.filters.push({ field, value })
    return b
  }
  b.gt = (field: string, value: unknown) => {
    recorder.filters.push({ field: `${field}>`, value })
    return b
  }
  b.maybeSingle = async () => {
    if (recorder.op === 'update') {
      const arr = (mockUpdateData ?? []) as unknown[]
      return { data: arr[0] ?? null, error: mockError }
    }
    return { data: mockSelectData, error: mockError }
  }
  b.single = async () => ({ data: mockInsertData ?? mockSelectData, error: mockError })
  return b
}

const fakeSupabase = {
  from: (table: string) => {
    recorder = { table, filters: [] }
    const builder = makeFakeBuilder() as Record<string, unknown>
    builder.select = (cols: string) => {
      recorder.op = recorder.op ?? 'select'
      recorder.selectedColumns = cols
      const sel = makeFakeBuilder() as Record<string, unknown>
      // 后续 .eq / .gt / .maybeSingle 都走 sel；为了简单复用同一个 recorder
      Object.assign(sel, {
        eq: (field: string, value: unknown) => {
          recorder.filters.push({ field, value })
          return sel
        },
        gt: (field: string, value: unknown) => {
          recorder.filters.push({ field: `${field}>`, value })
          return sel
        },
        maybeSingle: async () => {
          if (recorder.op === 'update') {
            return { data: ((mockUpdateData ?? []) as unknown[])[0] ?? null, error: mockError }
          }
          return { data: mockSelectData, error: mockError }
        },
        single: async () => ({ data: mockInsertData ?? mockSelectData, error: mockError })
      })
      // for update().select() chain (returns array), 提供一个 await-able promise
      ;(sel as { then?: unknown }).then = (
        resolve: (v: { data: unknown; error: unknown }) => unknown
      ) => resolve({ data: mockUpdateData, error: mockError })
      return sel
    }
    builder.insert = (payload: unknown) => {
      recorder.op = 'insert'
      recorder.inserted = payload
      return builder
    }
    builder.update = (payload: unknown) => {
      recorder.op = 'update'
      recorder.updated = payload
      return builder
    }
    return builder
  }
}

vi.mock('../../src/db/client', () => ({
  getSupabaseServiceClient: () => fakeSupabase
}))

import { load, upsert, interrupt } from '../../src/tools/session'

beforeEach(() => {
  recorder = { filters: [] }
  mockSelectData = null
  mockUpdateData = null
  mockInsertData = null
  mockError = null
})

describe('SessionTool.load', () => {
  it('returns null when sessionId / userId / documentId is empty', async () => {
    expect(await load('', 'u', 'd')).toBeNull()
    expect(await load('s', '', 'd')).toBeNull()
    expect(await load('s', 'u', '')).toBeNull()
  })

  it('forces id + user_id + document_id + deleted=0 + expires_at>now predicates', async () => {
    mockSelectData = null
    await load('sess-1', 'user-1', 'doc-1')
    const fields = recorder.filters.map((f) => f.field)
    expect(fields).toContain('id')
    expect(fields).toContain('user_id')
    expect(fields).toContain('document_id')
    expect(fields).toContain('deleted')
    expect(fields).toContain('expires_at>')
  })

  it('returns null when no row matches', async () => {
    mockSelectData = null
    const result = await load('s', 'u', 'd')
    expect(result).toBeNull()
  })

  it('maps row to SkillSession when found', async () => {
    mockSelectData = {
      id: 's',
      user_id: 'u',
      document_id: 'd',
      skill: '/tutor',
      state: { status: 'active' },
      expires_at: '2099-01-01T00:00:00Z',
      deleted: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
    const result = await load('s', 'u', 'd')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('s')
    expect(result!.skill).toBe('/tutor')
    expect(result!.state.status).toBe('active')
  })
})

describe('SessionTool.upsert', () => {
  it('INSERTs when no id provided', async () => {
    mockInsertData = {
      id: 'new-id',
      user_id: 'u',
      document_id: 'd',
      skill: '/tutor',
      state: { status: 'active' },
      expires_at: '2099-01-01',
      deleted: 0,
      created_at: '2024-01-01',
      updated_at: '2024-01-01'
    }
    const result = await upsert({
      userId: 'u',
      documentId: 'd',
      skill: '/tutor',
      state: { status: 'active' }
    })
    expect(recorder.op).toBe('insert')
    expect(result.id).toBe('new-id')
  })

  it('UPDATEs when id provided + enforces user_id predicate', async () => {
    mockUpdateData = [
      {
        id: 'existing',
        user_id: 'u',
        document_id: 'd',
        skill: '/tutor',
        state: { status: 'active' },
        expires_at: '2099-01-01',
        deleted: 0,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      }
    ]
    await upsert({
      id: 'existing',
      userId: 'u-strict',
      documentId: 'd',
      skill: '/tutor',
      state: { status: 'active' }
    })
    expect(recorder.op).toBe('update')
    const fields = recorder.filters.map((f) => `${f.field}=${f.value}`)
    expect(fields).toContain('id=existing')
    expect(fields).toContain('user_id=u-strict')
  })

  it('throws when UPDATE returns 0 rows (no silent INSERT fallback)', async () => {
    mockUpdateData = []
    await expect(
      upsert({
        id: 'unknown',
        userId: 'u',
        documentId: 'd',
        skill: '/tutor',
        state: { status: 'active' }
      })
    ).rejects.toThrow(/no session matched/)
  })

  it('throws when userId / documentId / skill missing', async () => {
    await expect(
      upsert({
        userId: '',
        documentId: 'd',
        skill: '/tutor',
        state: { status: 'active' }
      })
    ).rejects.toThrow(/required/)
  })
})

describe('SessionTool.interrupt (atomic affected rows)', () => {
  it('returns 0 when sessionId / userId is empty', async () => {
    expect(await interrupt('', 'u')).toBe(0)
    expect(await interrupt('s', '')).toBe(0)
  })

  it('returns 0 when SELECT finds no row', async () => {
    mockSelectData = null
    const affected = await interrupt('non-existent', 'u')
    expect(affected).toBe(0)
  })

  it('returns 1 when UPDATE succeeds', async () => {
    // SELECT 阶段：返回 state；UPDATE 阶段：返回 1 行
    mockSelectData = { state: { status: 'active', currentChapterIndex: 1 } }
    mockUpdateData = [{ id: 'sess-1' }]
    const affected = await interrupt('sess-1', 'user-1')
    expect(affected).toBe(1)
  })

  it('writes state.status="interrupted" and expires_at in UPDATE payload', async () => {
    mockSelectData = { state: { status: 'active' } }
    mockUpdateData = [{ id: 's' }]
    await interrupt('s', 'u')
    expect(recorder.op).toBe('update')
    const updated = recorder.updated as Record<string, unknown>
    expect((updated.state as { status: string }).status).toBe('interrupted')
    expect(typeof updated.expires_at).toBe('string')
  })
})
