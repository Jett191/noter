import 'server-only'

/**
 * GET  /api/admin/system-settings — 返回 4 项配置
 * PATCH /api/admin/system-settings — 更新单项配置
 *
 * 设计参见 design.md §6.5 (系统设置) 与 Requirements 24:
 *   - 受 requireAdmin() 保护
 *   - GET: 返回所有 4 项 system_settings
 *   - PATCH:
 *       body: { key: SettingKey, value: boolean }
 *       事务内 UPDATE settings + INSERT audit_log
 *       切换 audit_log_enabled 自身始终写日志(force=true)
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { readAllSettings, invalidateSettingsCache } from '@/lib/settings/readSetting'
import { isSettingKey, type SettingKey } from '@/lib/settings/defaults'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'

// ─── GET handler ───
async function getHandler(request: Request): Promise<Response> {
  await requireAdmin()

  const settings = await readAllSettings()

  return success({ settings })
}

// ─── PATCH handler ───
async function patchHandler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 解析 body ───
  let body: { key?: unknown; value?: unknown }
  try {
    body = await request.json()
  } catch {
    throw new ValidationError('请求体必须为有效 JSON')
  }

  const { key, value } = body

  // ─── 3. 参数校验 ───
  if (typeof key !== 'string' || !isSettingKey(key)) {
    throw new ValidationError(
      'key 参数无效,允许值: allow_user_upload, allow_user_delete_own, public_documents_visible, audit_log_enabled'
    )
  }
  if (typeof value !== 'boolean') {
    throw new ValidationError('value 参数无效,必须为 boolean')
  }

  const settingKey = key as SettingKey

  // ─── 4. 更新设置 ───
  const adminClient = getSupabaseAdmin()

  const { error: updateError } = await adminClient
    .from('system_settings')
    .update({
      value: value,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId
    })
    .eq('key', settingKey)

  if (updateError) {
    throw new Error(`更新设置失败: ${updateError.message}`)
  }

  // ─── 5. 使缓存失效 ───
  invalidateSettingsCache()

  // ─── 6. 写审计日志 ───
  // 切换 audit_log_enabled 自身始终写日志(force=true)
  const isAuditLogToggle = settingKey === 'audit_log_enabled'

  await writeAuditLog({
    adminUserId: admin.userId,
    adminEmail: admin.email,
    actionType: 'system_settings.update',
    targetResourceType: 'system_settings',
    targetResourceId: undefined,
    targetResourceLabel: settingKey,
    metadata: { key: settingKey, newValue: value },
    request,
    force: isAuditLogToggle
  })

  return success({ success: true, key: settingKey, value })
}

export const GET = withRouteHandler(getHandler, { timeoutMs: 10_000 })
export const PATCH = withRouteHandler(patchHandler, { timeoutMs: 15_000 })
