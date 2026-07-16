/**
 * PATCH /api/ai/sessions/[id]   —— 退出 session（state.status='ended', expires_at=now()）
 * DELETE /api/ai/sessions/[id]  —— 软删（deleted=1）
 *
 * 共同流程：
 *   1. 鉴权：未登录返回 401
 *   2. 校验 sessionId 格式（UUID）
 *   3. 用 service-role client 反查 session 拿 `user_id` 与 `document_id`
 *      - session 不存在 → 404
 *      - `session.user_id !== user.id` → 403（不区分「不存在 / 不归属」也可以，
 *        本期为简化保留 404 vs 403 分离；归属错误统一 403 与 design 一致）
 *   4. 两步校验（针对 session.document_id）：
 *      - 归属与软删 → 403（脱敏）
 *      - 状态 → 422
 *   5. 通过后执行业务变更：
 *      - PATCH：UPDATE state（合并 status='ended'）+ expires_at=now()
 *      - DELETE：UPDATE deleted=1
 *
 * 所有 SQL 都强制 `user_id = :userId` 谓词（应用层第二道防线）。
 * agent_skill_sessions RLS 仅允许 service_role；普通 supabase auth client 会被 RLS 拒绝。
 *
 * Validates: Requirements 4.8, 4.9, 4.10, 11.4, 12.4, 12.5
 */

import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/admin'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { z } from 'zod'
import { validateDocumentAccess } from '@/lib/agent/session-validation'

type RouteContext = { params: Promise<{ id: string }> }

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const sessionIdSchema = z.object({
  id: z.string().regex(uuidRegex, '会话 ID 格式不正确')
})

interface SessionLookupRow {
  id: string
  user_id: string
  document_id: string
  state: Record<string, unknown> | null
  deleted: number
}

/**
 * 反查 session 并校验归属 + 文档两步校验。
 *
 * 返回值：
 *   - `{ ok: true, ... }`：所有校验通过，可执行业务变更
 *   - `{ ok: false, status, error }`：校验失败，调用方按 status 返回响应
 */
async function loadAndValidate(sessionId: string): Promise<
  | {
      ok: true
      userId: string
      documentId: string
      state: Record<string, unknown> | null
    }
  | { ok: false; status: 401 | 403 | 404 | 422 | 500; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: '未登录' }
  }

  // 用 service-role client 反查 session（前端被 RLS 阻止直读）
  const admin = getServiceClient()
  const { data: row, error: dbError } = await admin
    .from('agent_skill_sessions')
    .select('id, user_id, document_id, state, deleted')
    .eq('id', sessionId)
    .maybeSingle<SessionLookupRow>()

  if (dbError) {
    return { ok: false, status: 500, error: '查询会话失败' }
  }
  if (!row) {
    return { ok: false, status: 404, error: '会话不存在' }
  }

  // 归属校验：session.user_id 必须等于当前用户
  if (row.user_id !== user.id) {
    return { ok: false, status: 403, error: '无权访问该会话' }
  }

  // 已软删的 session 视为不存在
  if (row.deleted === 1) {
    return { ok: false, status: 404, error: '会话不存在' }
  }

  // 两步校验：归属 → 状态
  const result = await validateDocumentAccess(supabase, row.document_id, user.id)
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error }
  }

  return {
    ok: true,
    userId: user.id,
    documentId: row.document_id,
    state: row.state
  }
}

/**
 * PATCH /api/ai/sessions/[id]
 * 将 state.status 设为 'ended'、expires_at = now()
 */
export const PATCH = handler(async (_request: Request, { params }: RouteContext) => {
  const { id: rawId } = await params
  const { id: sessionId } = sessionIdSchema.parse({ id: rawId })

  const validated = await loadAndValidate(sessionId)
  if (!validated.ok) {
    return error(validated.error, validated.status)
  }

  const baseState = (validated.state ?? { status: 'active' }) as Record<string, unknown>
  const nextState = { ...baseState, status: 'ended' }

  const admin = getServiceClient()
  const { data: updated, error: updateError } = await admin
    .from('agent_skill_sessions')
    .update({
      state: nextState,
      expires_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('user_id', validated.userId)
    .select('id')

  if (updateError) {
    return error('更新会话失败', 500)
  }

  if (!updated || updated.length === 0) {
    // 极端竞态：在 loadAndValidate 与此处 UPDATE 之间会话被其它请求改动；
    // 仍然返回 404 让前端按「会话已结束」处理
    return error('会话不存在', 404)
  }

  return success(null, '会话已退出')
})

/**
 * DELETE /api/ai/sessions/[id]
 * 软删（deleted = 1）
 */
export const DELETE = handler(async (_request: Request, { params }: RouteContext) => {
  const { id: rawId } = await params
  const { id: sessionId } = sessionIdSchema.parse({ id: rawId })

  const validated = await loadAndValidate(sessionId)
  if (!validated.ok) {
    return error(validated.error, validated.status)
  }

  const admin = getServiceClient()
  const { data: updated, error: updateError } = await admin
    .from('agent_skill_sessions')
    .update({ deleted: 1 })
    .eq('id', sessionId)
    .eq('user_id', validated.userId)
    .select('id')

  if (updateError) {
    return error('删除会话失败', 500)
  }

  if (!updated || updated.length === 0) {
    return error('会话不存在', 404)
  }

  return success(null, '会话已删除')
})
