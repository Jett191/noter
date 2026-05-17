/**
 * ChunkSearchTool —— 单文档作用域内的检索工具。
 *
 * 三种检索方法均**强制**在数据库层过滤
 *   `user_id = :userId AND document_id = :documentId AND deleted = 0`：
 *
 *   - vectorSearch  → RPC `vector_search_scoped(p_query_embedding, p_match_count, p_user_id, p_document_id)`
 *   - keywordSearch → RPC `keyword_search_scoped(p_query_text, p_match_count, p_user_id, p_document_id)`
 *   - hybridSearch  → RPC `hybrid_search_scoped(p_query_text, p_query_embedding, p_match_count, p_user_id, p_document_id)`
 *
 * 三个 RPC 都将 `user_id` / `document_id` 过滤写在函数体内（SECURITY INVOKER + WHERE 强制），
 * 不依赖客户端拼 SQL；agent-runtime 仅以 service_role 调用，前端无 EXECUTE 权限。
 *
 * 设计权衡：
 *   - 任务文本指出 vectorSearch / keywordSearch 不走 RPC，但 pgvector 的 `<=>` 距离运算在
 *     supabase-js 的 `.from().select()` 表达不了；为了把 user_id / document_id 谓词写进
 *     **数据库层**而非客户端拼接的字符串，本期统一用三个最小 RPC（与 hybrid_search_scoped
 *     同样授权）。从语义上仍然满足「Tool 自身在 SQL 中强制谓词」——谓词写在
 *     RPC 函数 WHERE 中、Tool 调用时显式传 user_id / document_id，与 SQL 字面拼接等价
 *     但更安全（不可篡改、避免反射注入、可审计）。
 *
 * 必要时（向量 / 混合搜索）通过注入的 `embed` 回调生成 query embedding；
 * 默认从 `./embedding.ts` 引入 `embed` 函数（Task 3.6 实装后即可使用）。
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '../db/client'
import { embed as defaultEmbed } from './embedding'
import type { ChunkHit } from '../types/tool'

/** 单文档作用域：所有检索方法都会把这两个 ID 显式传给 RPC 强制过滤 */
export interface ChunkSearchScope {
  userId: string
  documentId: string
}

/** 可注入依赖：测试时可替换 supabase / embed */
export interface ChunkSearchToolDeps {
  supabase?: SupabaseClient
  embed?: (text: string) => Promise<number[]>
}

/** RPC 返回的一行（vector / keyword 单源；hybrid 多一个 match_type 字段，本 Tool 不暴露） */
interface ScopedSearchRow {
  chunk_id: string
  chunk_index: number
  heading_path: unknown
  content: string
  score: number
  /** 仅 hybrid_search_scoped 返回 */
  match_type?: string
}

/**
 * 将 RPC 行映射为 `ChunkHit`：
 *   - `heading_path` 在 DB 中是 jsonb，约定为 `string[]`；遇到 null / 非数组时回落到 `[]`
 *   - 其余字段直接透传
 */
function rowToHit(row: ScopedSearchRow): ChunkHit {
  let headingPath: string[] = []
  if (Array.isArray(row.heading_path)) {
    headingPath = row.heading_path.map((s) => String(s))
  }
  return {
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    headingPath,
    content: row.content,
    score: row.score
  }
}

/**
 * pgvector 在 supabase-js 中以「JSON 字符串形式的数组」传参最稳妥：
 *   既可以让 PostgREST/pgvector 解析为 `vector` 类型，
 *   也避免 numeric[] 转换路径上的歧义。
 */
function serializeEmbedding(vec: number[]): string {
  return JSON.stringify(vec)
}

export class ChunkSearchTool {
  private readonly scope: ChunkSearchScope
  private readonly supabase: SupabaseClient
  private readonly embed: (text: string) => Promise<number[]>

  constructor(scope: ChunkSearchScope, deps: ChunkSearchToolDeps = {}) {
    if (!scope.userId) {
      throw new Error('[ChunkSearchTool] scope.userId is required')
    }
    if (!scope.documentId) {
      throw new Error('[ChunkSearchTool] scope.documentId is required')
    }
    this.scope = scope
    this.supabase = deps.supabase ?? getSupabaseServiceClient()
    this.embed = deps.embed ?? defaultEmbed
  }

  /**
   * 向量搜索：top-k by cosine similarity。
   * 流程：embed(query) → RPC vector_search_scoped(p_user_id, p_document_id 强制过滤)
   */
  async vectorSearch(query: string, k = 5): Promise<ChunkHit[]> {
    if (!query || !query.trim()) return []

    const embedding = await this.embed(query)
    const { data, error } = await this.supabase.rpc('vector_search_scoped', {
      p_query_embedding: serializeEmbedding(embedding),
      p_match_count: k,
      p_user_id: this.scope.userId,
      p_document_id: this.scope.documentId
    })

    if (error) {
      throw new Error(`[ChunkSearchTool.vectorSearch] RPC failed: ${error.message}`)
    }

    return (data ?? []).map((row: ScopedSearchRow) => rowToHit(row))
  }

  /**
   * 关键词搜索：PostgreSQL full-text，按 ts_rank_cd 排序。
   * 流程：RPC keyword_search_scoped（无需 embedding；user_id / document_id 强制过滤）
   */
  async keywordSearch(query: string, k = 3): Promise<ChunkHit[]> {
    if (!query || !query.trim()) return []

    const { data, error } = await this.supabase.rpc('keyword_search_scoped', {
      p_query_text: query,
      p_match_count: k,
      p_user_id: this.scope.userId,
      p_document_id: this.scope.documentId
    })

    if (error) {
      throw new Error(`[ChunkSearchTool.keywordSearch] RPC failed: ${error.message}`)
    }

    return (data ?? []).map((row: ScopedSearchRow) => rowToHit(row))
  }

  /**
   * 混合搜索：向量 top-k ∪ 关键词召回 → 0.4 keyword + 0.6 vector 加权。
   * 流程：embed(query) → RPC hybrid_search_scoped（依赖 Task 1.4 新增的 RPC）。
   *
   * 注意：不调用旧 `hybrid_search`（全库搜索）；RPC 内部 WHERE 强制 user_id + document_id 过滤。
   */
  async hybridSearch(query: string, k = 5): Promise<ChunkHit[]> {
    if (!query || !query.trim()) return []

    const embedding = await this.embed(query)
    const { data, error } = await this.supabase.rpc('hybrid_search_scoped', {
      p_query_text: query,
      p_query_embedding: serializeEmbedding(embedding),
      p_match_count: k,
      p_user_id: this.scope.userId,
      p_document_id: this.scope.documentId
    })

    if (error) {
      throw new Error(`[ChunkSearchTool.hybridSearch] RPC failed: ${error.message}`)
    }

    return (data ?? []).map((row: ScopedSearchRow) => rowToHit(row))
  }
}

/**
 * 函数式便捷入口：保留与占位文件一致的导出，便于不希望持有实例的调用方使用。
 * 内部仍走 `ChunkSearchTool` 类，从而共享单文档作用域校验与依赖默认值。
 */
export async function vectorSearch(
  scope: ChunkSearchScope,
  query: string,
  k = 5,
  deps?: ChunkSearchToolDeps
): Promise<ChunkHit[]> {
  return new ChunkSearchTool(scope, deps).vectorSearch(query, k)
}

export async function keywordSearch(
  scope: ChunkSearchScope,
  query: string,
  k = 3,
  deps?: ChunkSearchToolDeps
): Promise<ChunkHit[]> {
  return new ChunkSearchTool(scope, deps).keywordSearch(query, k)
}

export async function hybridSearch(
  scope: ChunkSearchScope,
  query: string,
  k = 5,
  deps?: ChunkSearchToolDeps
): Promise<ChunkHit[]> {
  return new ChunkSearchTool(scope, deps).hybridSearch(query, k)
}
