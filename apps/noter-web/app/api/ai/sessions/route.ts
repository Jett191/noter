/**
 * GET /api/ai/sessions?documentId=<uuid>
 *
 * 查询当前用户当前文档的活跃 session。
 *
 * 流程：
 *   1. 鉴权：`createClient()` → `auth.getUser()`，未登录返回 401
 *   2. 必填校验：`documentId` 查询参数缺失返回 400
 *   3. 两步校验（与 /api/ai/chat/stream、PATCH/DELETE 共享）：
 *      - 归属与软删 → 403（脱敏不区分三种情况）
 *      - 状态 → 422（仅在归属通过后执行）
 *   4. 用 service-role client 读取 agent_skill_sessions：
 *      - `user_id = :userId AND document_id = :documentId`
 *      - `deleted = 0 AND expires_at > now()`
 *      - `state.status ∈ {'active', 'configuring', 'answering'}`
 *   5. 命中 0 行 → `{ session: null }`；命中 1 行 → 脱敏后返回
 *
 * 脱敏：`state.questions[i].correctAnswer` 必须剥离（agent_skill_sessions 前端禁直读）。
 *
 * 注意：表 RLS 仅允许 service_role；普通 supabase auth client 直查会 permission denied。
 *
 * Validates: Requirements 4.8, 4.9, 4.10, 11.4, 12.4, 12.5
 */

import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/admin'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { documentIdSchema } from '@/utils/feature/documents/schemas'
import { validateDocumentAccess } from '@/lib/agent/session-validation'
import { sanitizeSession } from '@/lib/agent/session-sanitize'

interface AgentSkillSessionRow {
  id: string
  user_id: string
  document_id: string
  skill: string
  state: Record<string, unknown> | null
  expires_at: string
  created_at: string
  updated_at: string
}

const ACTIVE_STATUSES: string[] = ['active', 'configuring', 'answering']

export const GET = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // documentId 必填
  const url = new URL(request.url)
  const documentIdRaw = url.searchParams.get('documentId')
  if (!documentIdRaw) {
    return error('缺少 documentId 查询参数', 400)
  }

  // 校验 documentId 格式
  const { id: documentId } = documentIdSchema.parse({ id: documentIdRaw })

  // 两步校验
  const result = await validateDocumentAccess(supabase, documentId, user.id)
  if (!result.ok) {
    return error(result.error, result.status)
  }

  // service-role 读取 agent_skill_sessions
  const admin = getServiceClient()
  const nowIso = new Date().toISOString()

  const { data, error: dbError } = await admin
    .from('agent_skill_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('deleted', 0)
    .gt('expires_at', nowIso)
    .in('state->>status', ACTIVE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<AgentSkillSessionRow>()

  if (dbError) {
    return error('查询会话失败', 500)
  }

  if (!data) {
    return success({ session: null })
  }

  // 脱敏 + 字段命名归一化（snake_case → camelCase）
  const sanitized = sanitizeSession({
    id: data.id,
    userId: data.user_id,
    documentId: data.document_id,
    skill: data.skill,
    state: data.state ?? { status: 'active' },
    expiresAt: data.expires_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  })

  return success({ session: sanitized })
})
