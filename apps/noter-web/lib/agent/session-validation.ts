/**
 * Agent 端点共享的两步校验逻辑：
 *
 *   1. 鉴权：未登录返回 401（脱敏不区分原因）
 *   2. 归属与软删 → 403：`documents.id = :documentId AND user_id = :userId AND deleted = 0`
 *      失败时统一返回 403，不区分「不存在 / 不属于 / 已软删」三种情况
 *   3. 状态 → 422：仅在归属校验通过后执行；`status = 'ready'` 失败时返回 422
 *      + 「文档尚未处理完成」提示
 *
 * 注意：
 *   - 第一步未通过时**不得**返回 422。422 必须严格出现在归属通过之后。
 *   - 这一顺序消除了「403 与 422 同时校验」可能造成的语义冲突（design.md 关键约定）。
 *   - 三个 `/api/ai/sessions` 端点与 `/api/ai/chat/stream` 共享此逻辑，不得绕过。
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ValidationResult = { ok: true } | { ok: false; status: 401 | 403 | 422; error: string }

/**
 * 执行两步校验。调用方需先取得 supabase auth client（用于沿用用户 cookie session 调 documents 表）。
 *
 * 实现方式：使用 supabase auth client 的 `from('documents')` 查询，依赖 documents 表的
 * `auth.uid() = user_id` RLS 策略 + 应用层 `user_id = :userId` 谓词 双重过滤。
 */
export async function validateDocumentAccess(
  supabase: SupabaseClient,
  documentId: string,
  userId: string
): Promise<ValidationResult> {
  // 第一步：归属与软删 → 403
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('id, status')
    .eq('id', documentId)
    .eq('user_id', userId)
    .eq('deleted', 0)
    .maybeSingle<{ id: string; status: string }>()

  // PostgREST `select` 出错（不是「未找到」）当作 500-级错误转换成 403 也可，
  // 但更稳妥的做法是直接当作归属失败一并 403 脱敏，避免泄露 DB 错误信息
  if (docError) {
    return { ok: false, status: 403, error: '文档不存在或无权访问' }
  }

  if (!document) {
    return { ok: false, status: 403, error: '文档不存在或无权访问' }
  }

  // 第二步：状态 → 422（仅在第一步通过后执行）
  if (document.status !== 'ready') {
    return { ok: false, status: 422, error: '文档尚未处理完成' }
  }

  return { ok: true }
}
