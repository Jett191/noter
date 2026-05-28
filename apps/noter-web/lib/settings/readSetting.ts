/**
 * noter-web · 读取 system_settings 中的访问控制开关。
 *
 * 与 admin 平台 task 17.5 / Requirements 24 / design.md §5.4 对齐:
 *   - 普通用户使用 cookie session 客户端读取 system_settings (RLS 已对 authenticated
 *     全员放开 SELECT,见 supabase/migrations/...admin_platform_rls_policies.sql)。
 *   - 当 system_settings 表中某 key 不存在或读取失败时,回退到默认值 (true,
 *     与 noter-admin/lib/settings/defaults.ts 与 migration seed 保持一致)。
 *   - 读取失败永不抛错,只在服务端日志中 warn,以避免门控代码把整条 API 拖垮。
 *   - 进程内缓存 TTL 30s,与 noter-admin 行为一致;管理员通过 PATCH 修改后,
 *     最长 30s 生效,符合 MVP 要求。
 *
 * 仅可在 Next.js server 端 (Route Handler / Server Component / Server Action)
 * 中 import,避免把 cookie session 的 cookies() 调用泄漏到浏览器侧。
 */

import { createClient } from '@/lib/supabase/server'

export const SETTING_KEYS = [
  'allow_user_upload',
  'allow_user_delete_own',
  'public_documents_visible',
  'audit_log_enabled'
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

const SETTING_DEFAULTS: Readonly<Record<SettingKey, boolean>> = Object.freeze({
  allow_user_upload: true,
  allow_user_delete_own: true,
  public_documents_visible: true,
  audit_log_enabled: true
})

function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value)
}

interface CacheEntry {
  values: Partial<Record<SettingKey, boolean>>
  fetchedAt: number
}

const CACHE_TTL_MS = 30_000
let _cache: CacheEntry | null = null
let _inFlight: Promise<CacheEntry> | null = null

async function loadAllSettings(): Promise<CacheEntry> {
  if (_inFlight) return _inFlight

  _inFlight = (async () => {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.from('system_settings').select('key, value')
      if (error) {
        console.warn(`[noter-web][settings] load failed, fallback to defaults: ${error.message}`)
        return { values: {}, fetchedAt: Date.now() }
      }
      const values: Partial<Record<SettingKey, boolean>> = {}
      for (const row of data ?? []) {
        const key = row.key as string
        if (isSettingKey(key) && typeof row.value === 'boolean') {
          values[key] = row.value
        }
      }
      const entry: CacheEntry = { values, fetchedAt: Date.now() }
      _cache = entry
      return entry
    } finally {
      _inFlight = null
    }
  })()

  return _inFlight
}

/**
 * 读取指定 key 的值 (boolean)。
 * 缓存命中走缓存,过期或未命中走 DB,失败回退默认。
 */
export async function readSetting(key: SettingKey): Promise<boolean> {
  const now = Date.now()
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    const v = _cache.values[key]
    if (typeof v === 'boolean') return v
    return SETTING_DEFAULTS[key]
  }
  const entry = await loadAllSettings()
  const v = entry.values[key]
  if (typeof v === 'boolean') return v
  return SETTING_DEFAULTS[key]
}
