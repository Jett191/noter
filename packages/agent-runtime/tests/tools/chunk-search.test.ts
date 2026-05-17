/**
 * ChunkSearchTool 单测 + Property 3 同文档作用域强制。
 *
 * 验证：
 *   - vectorSearch / keywordSearch / hybridSearch 均通过 RPC 调用，
 *     RPC 参数中 p_user_id / p_document_id 与 scope 一致（Property 3）
 *   - 返回结构 ChunkHit 字段完整、heading_path 容错
 *   - 空查询直接返回 []
 *
 * 实现策略：直接通过 deps 注入 fakeSupabase + fake embed，避免动态 mock。
 */

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ChunkSearchTool } from '../../src/tools/chunk-search'

interface RpcCall {
  fnName: string
  params: Record<string, unknown>
}

function makeFakeSupabase(rows: unknown[] = [], rpcCalls: RpcCall[] = []) {
  return {
    rpc: vi.fn(async (fnName: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fnName, params })
      return { data: rows, error: null }
    })
  } as unknown as SupabaseClient
}

const fakeEmbedding = new Array(768).fill(0.5)

describe('ChunkSearchTool constructor', () => {
  it('throws if scope.userId is empty', () => {
    expect(
      () =>
        new ChunkSearchTool({ userId: '', documentId: 'd' }, { embed: async () => fakeEmbedding })
    ).toThrow(/userId is required/)
  })

  it('throws if scope.documentId is empty', () => {
    expect(
      () =>
        new ChunkSearchTool({ userId: 'u', documentId: '' }, { embed: async () => fakeEmbedding })
    ).toThrow(/documentId is required/)
  })
})

describe('ChunkSearchTool.vectorSearch', () => {
  it('returns [] when query is empty/blank without RPC call', async () => {
    const rpcCalls: RpcCall[] = []
    const fake = makeFakeSupabase([], rpcCalls)
    const tool = new ChunkSearchTool(
      { userId: 'u', documentId: 'd' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    expect(await tool.vectorSearch('')).toEqual([])
    expect(await tool.vectorSearch('   ')).toEqual([])
    expect(rpcCalls.length).toBe(0)
  })

  it('calls vector_search_scoped RPC with user_id + document_id', async () => {
    const rpcCalls: RpcCall[] = []
    const fake = makeFakeSupabase(
      [
        {
          chunk_id: 'c1',
          chunk_index: 0,
          heading_path: ['第一章'],
          content: 'hello',
          score: 0.9
        }
      ],
      rpcCalls
    )
    const tool = new ChunkSearchTool(
      { userId: 'user-A', documentId: 'doc-X' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    const hits = await tool.vectorSearch('q', 5)
    expect(hits.length).toBe(1)
    expect(hits[0].chunkId).toBe('c1')
    expect(rpcCalls.length).toBe(1)
    expect(rpcCalls[0].fnName).toBe('vector_search_scoped')
    expect(rpcCalls[0].params.p_user_id).toBe('user-A')
    expect(rpcCalls[0].params.p_document_id).toBe('doc-X')
    expect(rpcCalls[0].params.p_match_count).toBe(5)
  })

  it('throws on RPC error', async () => {
    const fake = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc fail' } }))
    } as unknown as SupabaseClient
    const tool = new ChunkSearchTool(
      { userId: 'u', documentId: 'd' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    await expect(tool.vectorSearch('q')).rejects.toThrow(/RPC failed/)
  })

  it('handles non-array heading_path by mapping to []', async () => {
    const fake = makeFakeSupabase([
      { chunk_id: 'c', chunk_index: 1, heading_path: null, content: 'x', score: 0.1 }
    ])
    const tool = new ChunkSearchTool(
      { userId: 'u', documentId: 'd' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    const hits = await tool.vectorSearch('q')
    expect(hits[0].headingPath).toEqual([])
  })
})

describe('ChunkSearchTool.keywordSearch', () => {
  it('calls keyword_search_scoped RPC with scope', async () => {
    const rpcCalls: RpcCall[] = []
    const fake = makeFakeSupabase([], rpcCalls)
    const tool = new ChunkSearchTool(
      { userId: 'u-1', documentId: 'd-1' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    await tool.keywordSearch('hello', 3)
    expect(rpcCalls[0].fnName).toBe('keyword_search_scoped')
    expect(rpcCalls[0].params.p_query_text).toBe('hello')
    expect(rpcCalls[0].params.p_user_id).toBe('u-1')
    expect(rpcCalls[0].params.p_document_id).toBe('d-1')
    expect(rpcCalls[0].params.p_match_count).toBe(3)
  })

  it('does NOT require embedding (no embed call)', async () => {
    const embed = vi.fn(async () => fakeEmbedding)
    const fake = makeFakeSupabase([])
    const tool = new ChunkSearchTool({ userId: 'u', documentId: 'd' }, { supabase: fake, embed })
    await tool.keywordSearch('q')
    expect(embed).not.toHaveBeenCalled()
  })
})

describe('ChunkSearchTool.hybridSearch', () => {
  it('calls hybrid_search_scoped (NOT old hybrid_search) with scope', async () => {
    const rpcCalls: RpcCall[] = []
    const fake = makeFakeSupabase([], rpcCalls)
    const tool = new ChunkSearchTool(
      { userId: 'u-2', documentId: 'd-2' },
      { supabase: fake, embed: async () => fakeEmbedding }
    )
    await tool.hybridSearch('q', 5)
    expect(rpcCalls[0].fnName).toBe('hybrid_search_scoped')
    expect(rpcCalls[0].fnName).not.toBe('hybrid_search')
    expect(rpcCalls[0].params.p_user_id).toBe('u-2')
    expect(rpcCalls[0].params.p_document_id).toBe('d-2')
  })
})

describe('Property 3: 同文档作用域强制', () => {
  it('all RPC calls always carry the configured user_id and document_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 50 }),
        async (userId, documentId, query, k) => {
          const rpcCalls: RpcCall[] = []
          const fake = makeFakeSupabase([], rpcCalls)
          const tool = new ChunkSearchTool(
            { userId, documentId },
            { supabase: fake, embed: async () => fakeEmbedding }
          )
          await tool.vectorSearch(query, k)
          await tool.keywordSearch(query, k)
          await tool.hybridSearch(query, k)
          // 所有 RPC 调用必须传入正确 scope
          for (const call of rpcCalls) {
            expect(call.params.p_user_id).toBe(userId)
            expect(call.params.p_document_id).toBe(documentId)
          }
          // 不应触发任何旧 RPC（hybrid_search / hybrid_search_documents）
          for (const call of rpcCalls) {
            expect(call.fnName).not.toBe('hybrid_search')
            expect(call.fnName).not.toBe('hybrid_search_documents')
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
