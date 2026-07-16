/**
 * SessionTool —— `agent_skill_sessions` 表的 CRUD + 打断原子操作。
 *
 * 设计要点：
 *   - 所有方法的 SQL 都强制带 `user_id = :userId` 谓词（即便 RLS 层已经只对 service_role 开放，
 *     这里仍然作为应用层第二道防线，避免 service_role 客户端在调用方编程错误时跨用户写）。
 *   - `load` 还附加 `document_id = :documentId AND deleted = 0 AND expires_at > now()` 过滤；
 *     未命中 / 已过期 / 不归属统一返回 `null`，由调用方据此决定是 fresh 还是 resume。
 *   - `upsert` 根据是否带 `id` 选 INSERT 或 UPDATE；UPDATE 不会回退成 INSERT，
 *     id 不存在时直接抛错（属于编程错误）。
 *   - `interrupt(sessionId, userId)` 把 `state.status` 标记为 'interrupted' 且 `expires_at = now()`，
 *     返回受影响行数 0 或 1；调用方（orchestrator）据此判断 Skill_Switch 是否成功。
 *     supabase-js 的 PostgREST 不支持 SET 表达式（`jsonb_set`），因此采用「读 state → 合并 status → 写回」，
 *     行级 UPDATE 自身仍是原子的；本期 design.md 明确不要求事务原子性。
 *
 * 任务文本中 `interrupt(sessionId)` 仅含一个参数，但同时要求「所有方法 SQL 含 user_id 谓词」，
 * 故签名扩展为 `interrupt(sessionId, userId)`。
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceClient } from '../db/client'
import type { SkillName } from '../types/skill'
import type { SkillSession, SkillSessionState, SkillSessionUpsertInput } from '../types/session'

const TABLE = 'agent_skill_sessions'

/** DB 行（snake_case），与 migration 字段一一对应 */
interface AgentSkillSessionRow {
  id: string
  user_id: string
  document_id: string
  skill: string
  state: SkillSessionState | null
  expires_at: string
  deleted: number
  created_at: string
  updated_at: string
}

function mapRowToSession(row: AgentSkillSessionRow): SkillSession {
  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    skill: row.skill as SkillName,
    state: (row.state ?? { status: 'active' }) as SkillSessionState,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function client(): SupabaseClient {
  return getSupabaseServiceClient()
}

function fail(op: string, err: PostgrestError): never {
  throw new Error(`[SessionTool.${op}] supabase error: ${err.code ?? '?'} ${err.message}`)
}

/**
 * 加载并校验 session 归属。
 *
 * SQL（PostgREST 翻译后等价）：
 *   SELECT *
 *   FROM agent_skill_sessions
 *   WHERE id = :sessionId
 *     AND user_id = :userId
 *     AND document_id = :documentId
 *     AND deleted = 0
 *     AND expires_at > now()
 *   LIMIT 1
 *
 * 不命中 / 已过期 / 不归属一律返回 `null`。
 */
export async function load(
  sessionId: string,
  userId: string,
  documentId: string
): Promise<SkillSession | null> {
  if (!sessionId || !userId || !documentId) return null

  const nowIso = new Date().toISOString()
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .eq('deleted', 0)
    .gt('expires_at', nowIso)
    .maybeSingle<AgentSkillSessionRow>()

  if (error) fail('load', error)
  if (!data) return null
  return mapRowToSession(data)
}

/**
 * INSERT 或 UPDATE 一条 session 记录。
 *
 *   - 不带 `id` → INSERT；DB 默认生成 id / expires_at / created_at / updated_at
 *   - 带 `id`   → UPDATE（必须带 `user_id = :userId` 谓词避免越权）
 *
 * UPDATE 时若 0 行匹配（id 不存在或不属于该 userId），抛错而非静默 INSERT，
 * 因为这通常是上层编程错误。`updated_at` 由 DB 触发器自动维护，不需要手动写。
 */
export async function upsert(input: SkillSessionUpsertInput): Promise<SkillSession> {
  if (!input.userId || !input.documentId || !input.skill) {
    throw new Error('[SessionTool.upsert] userId / documentId / skill are required')
  }

  const c = client()

  if (input.id) {
    // —— UPDATE 分支 ——
    const updatePayload: Record<string, unknown> = {
      skill: input.skill,
      state: input.state,
      document_id: input.documentId
    }
    if (input.expiresAt !== undefined) {
      updatePayload.expires_at = input.expiresAt
    }

    const { data, error } = await c
      .from(TABLE)
      .update(updatePayload)
      .eq('id', input.id)
      .eq('user_id', input.userId)
      .select('*')
      .maybeSingle<AgentSkillSessionRow>()

    if (error) fail('upsert(update)', error)
    if (!data) {
      throw new Error(
        `[SessionTool.upsert] no session matched id=${input.id} user_id=${input.userId}; upsert refuses to fall back to insert`
      )
    }
    return mapRowToSession(data)
  }

  // —— INSERT 分支 ——
  const insertPayload: Record<string, unknown> = {
    user_id: input.userId,
    document_id: input.documentId,
    skill: input.skill,
    state: input.state
  }
  if (input.expiresAt !== undefined) {
    insertPayload.expires_at = input.expiresAt
  }

  const { data, error } = await c
    .from(TABLE)
    .insert(insertPayload)
    .select('*')
    .single<AgentSkillSessionRow>()

  if (error) fail('upsert(insert)', error)
  if (!data) {
    throw new Error('[SessionTool.upsert] insert returned no row')
  }
  return mapRowToSession(data)
}

/**
 * 把 session 标记为 interrupted 并立即过期。
 *
 * 等价 SQL（design.md 中描述）：
 *   UPDATE agent_skill_sessions
 *      SET state = jsonb_set(state, '{status}', '"interrupted"'),
 *          expires_at = now()
 *    WHERE id = :sessionId
 *      AND user_id = :userId
 *
 * supabase-js / PostgREST 不支持 SET 表达式中的 jsonb_set，故采用「读 state → 合并 status → 写回」：
 *   1. SELECT state WHERE id AND user_id；不命中直接返回 0；
 *   2. UPDATE 整个 state（已合并 status='interrupted'）+ expires_at=now()；带 user_id 谓词。
 *
 * 行级 UPDATE 自身原子，本期 design.md 明确不要求事务原子性。
 *
 * 返回受影响行数（0 或 1）；调用方据此判断打断是否成功。
 */
export async function interrupt(sessionId: string, userId: string): Promise<number> {
  if (!sessionId || !userId) return 0

  const c = client()

  const { data: current, error: selectError } = await c
    .from(TABLE)
    .select('state')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ state: SkillSessionState | null }>()

  if (selectError) fail('interrupt(select)', selectError)
  if (!current) return 0

  const baseState: SkillSessionState = (current.state as SkillSessionState | null) ?? {
    status: 'active'
  }
  const nextState: SkillSessionState = {
    ...baseState,
    status: 'interrupted'
  }

  const { data: updated, error: updateError } = await c
    .from(TABLE)
    .update({
      state: nextState,
      expires_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('id')

  if (updateError) fail('interrupt(update)', updateError)
  return updated?.length ?? 0
}
