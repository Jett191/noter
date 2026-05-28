import 'server-only'

/**
 * Noter Admin · 系统设置读取(带进程内缓存)
 *
 * 设计参见 design.md §3 (Components / readSetting) 与 Requirements 24。
 *
 * 行为契约:
 *   1. 进程内缓存:首次读取 system_settings 全表写入 _cache,后续读直接走缓存。
 *      缓存有 TTL,默认 30 秒(配置项变更后最长 30 秒生效),与 noter-web 行为一致。
 *   2. 缺失值走默认:某 key 在 DB 中不存在或读取失败时,返回 SETTING_DEFAULTS[key]。
 *   3. 读取失败永不抛错:仅 console.warn,后续调用方按默认值继续。
 *   4. 写端(PATCH /api/admin/system-settings)在事务提交后调用 invalidateSettingsCache()
 *      使缓存即时失效;否则等 TTL 自然过期。
 */

import { getSupabaseAdmin } from '../supabase/admin'
import { SETTING_DEFAULTS, isSettingKey, type SettingKey } from './defaults'

interface CacheEntry {
  values: Partial<Record<SettingKey, boolean>>
  fetchedAt: number
}

const CACHE_TTL_MS = 30_000
let _cache: CacheEntry | null = null
let _inFlight: Promise<CacheEntry> | null = null

/**
 * 立即使全部设置缓存失效。
 * 由 PATCH /api/admin/system-settings 在事务提交后调用。
 */
export function invalidateSettingsCache(): void {
  _cache = null
}

async function loadAllSettings(): Promise<CacheEntry> {
  // 合并并发请求:首次读时多个调用方共享同一个 Promise,避免雪崩。
  if (_inFlight) return _inFlight

  _inFlight = (async () => {
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase.from('system_settings').select('key, value')
      if (error) {
        console.warn(`[noter-admin][settings] load failed, fallback to defaults: ${error.message}`)
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
 * 读取指定 key 的值(boolean)。
 * 缓存命中走缓存,缓存过期或未命中走 DB,失败回退默认。
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

/**
 * 一次性读取所有 4 项设置,返回完整对象(缺失项走默认)。
 * 常用于 GET /api/admin/system-settings 响应。
 */
export async function readAllSettings(): Promise<Readonly<Record<SettingKey, boolean>>> {
  const now = Date.now()
  let entry: CacheEntry
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    entry = _cache
  } else {
    entry = await loadAllSettings()
  }
  return Object.freeze({
    allow_user_upload: entry.values.allow_user_upload ?? SETTING_DEFAULTS.allow_user_upload,
    allow_user_delete_own:
      entry.values.allow_user_delete_own ?? SETTING_DEFAULTS.allow_user_delete_own,
    public_documents_visible:
      entry.values.public_documents_visible ?? SETTING_DEFAULTS.public_documents_visible,
    audit_log_enabled: entry.values.audit_log_enabled ?? SETTING_DEFAULTS.audit_log_enabled
  })
}
