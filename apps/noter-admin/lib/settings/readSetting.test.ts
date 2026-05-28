/**
 * Unit tests · readSetting / readAllSettings / invalidateSettingsCache
 *
 * Task 16.3 (tasks.md): 单元测试:readSetting 缓存与默认值 fallback
 *
 * 关键不变量(对应 design.md §3 Components / readSetting、Requirements 24):
 *   1. 进程内缓存:首次读 system_settings 全表后,后续读直接走缓存,不再触发 DB 查询
 *   2. 缓存 TTL = 30 秒,超期后再次访问会重新查 DB
 *   3. invalidateSettingsCache() 立即让缓存失效
 *   4. DB 中缺失的 key → 返回 SETTING_DEFAULTS[key](全 true)
 *   5. DB 中类型异常的 value(非 boolean)→ 不进入缓存,走默认
 *   6. DB 查询失败 → console.warn + 走默认值,函数永不抛错
 *   7. 不同 key 的缓存命中互不影响(同一 fetchedAt 时刻内共享一份 _cache.values)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SETTING_DEFAULTS } from './defaults'

vi.mock('server-only', () => ({}))

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn()
}))

vi.mock('../supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSelect
    }))
  }))
}))

// 必须在 mock 之后再 import,且每个测试用 dynamic import + vi.resetModules
// 以重置模块级 _cache 状态(否则上一个测试的缓存会泄露到下一个)。
async function loadModule() {
  return await import('./readSetting')
}

describe('readSetting', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSelect.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===== 1. 缓存命中:同一 TTL 窗口内只查一次 DB =====

  describe('caching within TTL', () => {
    it('caches first DB read; subsequent reads do not hit DB', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { key: 'allow_user_upload', value: false },
          { key: 'audit_log_enabled', value: true }
        ],
        error: null
      })

      const { readSetting } = await loadModule()

      const v1 = await readSetting('allow_user_upload')
      const v2 = await readSetting('audit_log_enabled')
      const v3 = await readSetting('allow_user_upload')

      expect(v1).toBe(false)
      expect(v2).toBe(true)
      expect(v3).toBe(false)
      // 三次读取共享同一份缓存,只有 1 次 DB 调用
      expect(mockSelect).toHaveBeenCalledTimes(1)
    })

    it('different keys served from same cache entry', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { key: 'allow_user_upload', value: true },
          { key: 'allow_user_delete_own', value: false },
          { key: 'public_documents_visible', value: true },
          { key: 'audit_log_enabled', value: false }
        ],
        error: null
      })

      const { readSetting } = await loadModule()

      expect(await readSetting('allow_user_upload')).toBe(true)
      expect(await readSetting('allow_user_delete_own')).toBe(false)
      expect(await readSetting('public_documents_visible')).toBe(true)
      expect(await readSetting('audit_log_enabled')).toBe(false)

      expect(mockSelect).toHaveBeenCalledTimes(1)
    })

    it('coalesces concurrent first reads into a single DB call', async () => {
      // 模拟 select 异步:多个并发调用应共享同一 in-flight Promise
      let resolveSelect!: (v: unknown) => void
      mockSelect.mockReturnValue(
        new Promise((resolve) => {
          resolveSelect = resolve
        })
      )

      const { readSetting } = await loadModule()

      // 并发触发多次首读
      const p1 = readSetting('allow_user_upload')
      const p2 = readSetting('audit_log_enabled')
      const p3 = readSetting('allow_user_delete_own')

      // 此时 select 仅被调用过一次(in-flight 合并)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      resolveSelect({
        data: [{ key: 'allow_user_upload', value: false }],
        error: null
      })

      const [v1, v2, v3] = await Promise.all([p1, p2, p3])
      expect(v1).toBe(false)
      expect(v2).toBe(SETTING_DEFAULTS.audit_log_enabled) // 缺失走默认
      expect(v3).toBe(SETTING_DEFAULTS.allow_user_delete_own)
      expect(mockSelect).toHaveBeenCalledTimes(1)
    })
  })

  // ===== 2. TTL 过期 =====

  describe('TTL expiry', () => {
    it('refetches DB after TTL (30s) elapses', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0))

      mockSelect.mockResolvedValueOnce({
        data: [{ key: 'allow_user_upload', value: false }],
        error: null
      })

      const { readSetting } = await loadModule()

      const v1 = await readSetting('allow_user_upload')
      expect(v1).toBe(false)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      // 在 TTL 内(29s)再次读取 → 仍走缓存
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 29))
      const v2 = await readSetting('allow_user_upload')
      expect(v2).toBe(false)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      // 跨过 TTL(30.001s)→ 重新查 DB
      mockSelect.mockResolvedValueOnce({
        data: [{ key: 'allow_user_upload', value: true }],
        error: null
      })
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30, 1))
      const v3 = await readSetting('allow_user_upload')
      expect(v3).toBe(true)
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })

  // ===== 3. invalidateSettingsCache =====

  describe('invalidateSettingsCache()', () => {
    it('forces the next read to hit the DB again', async () => {
      mockSelect.mockResolvedValue({
        data: [{ key: 'allow_user_upload', value: false }],
        error: null
      })

      const { readSetting, invalidateSettingsCache } = await loadModule()

      await readSetting('allow_user_upload')
      await readSetting('allow_user_upload')
      expect(mockSelect).toHaveBeenCalledTimes(1)

      invalidateSettingsCache()

      mockSelect.mockResolvedValueOnce({
        data: [{ key: 'allow_user_upload', value: true }],
        error: null
      })
      const v = await readSetting('allow_user_upload')
      expect(v).toBe(true)
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })

  // ===== 4. 默认值 fallback =====

  describe('default value fallback', () => {
    it('returns SETTING_DEFAULTS when key is missing in DB', async () => {
      mockSelect.mockResolvedValue({ data: [], error: null })

      const { readSetting } = await loadModule()

      expect(await readSetting('allow_user_upload')).toBe(SETTING_DEFAULTS.allow_user_upload)
      expect(await readSetting('allow_user_delete_own')).toBe(
        SETTING_DEFAULTS.allow_user_delete_own
      )
      expect(await readSetting('public_documents_visible')).toBe(
        SETTING_DEFAULTS.public_documents_visible
      )
      expect(await readSetting('audit_log_enabled')).toBe(SETTING_DEFAULTS.audit_log_enabled)
    })

    it('returns default when DB row has non-boolean value', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { key: 'allow_user_upload', value: 'yes' }, // 非法类型
          { key: 'audit_log_enabled', value: null }
        ],
        error: null
      })

      const { readSetting } = await loadModule()

      expect(await readSetting('allow_user_upload')).toBe(SETTING_DEFAULTS.allow_user_upload)
      expect(await readSetting('audit_log_enabled')).toBe(SETTING_DEFAULTS.audit_log_enabled)
    })

    it('ignores DB rows with unknown setting keys', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { key: 'unknown_legacy_key', value: false },
          { key: 'allow_user_upload', value: false }
        ],
        error: null
      })

      const { readSetting } = await loadModule()

      // unknown_legacy_key 被 isSettingKey 过滤,不影响合法 key 的读取
      expect(await readSetting('allow_user_upload')).toBe(false)
      // 其他合法 key 仍走默认
      expect(await readSetting('audit_log_enabled')).toBe(SETTING_DEFAULTS.audit_log_enabled)
    })

    it('returns defaults and warns when DB read returns an error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'permission denied' }
      })

      const { readSetting } = await loadModule()

      expect(await readSetting('allow_user_upload')).toBe(SETTING_DEFAULTS.allow_user_upload)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      const logged = consoleWarnSpy.mock.calls[0][0] as string
      expect(logged).toContain('load failed')
      expect(logged).toContain('permission denied')

      consoleWarnSpy.mockRestore()
    })
  })

  // ===== 5. readAllSettings 一次性读取 =====

  describe('readAllSettings()', () => {
    it('returns all 4 keys with DB values where present and defaults elsewhere', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { key: 'allow_user_upload', value: false },
          { key: 'audit_log_enabled', value: false }
        ],
        error: null
      })

      const { readAllSettings } = await loadModule()
      const all = await readAllSettings()

      expect(all).toEqual({
        allow_user_upload: false,
        allow_user_delete_own: SETTING_DEFAULTS.allow_user_delete_own,
        public_documents_visible: SETTING_DEFAULTS.public_documents_visible,
        audit_log_enabled: false
      })
    })

    it('returns frozen object (readonly contract)', async () => {
      mockSelect.mockResolvedValue({ data: [], error: null })
      const { readAllSettings } = await loadModule()
      const all = await readAllSettings()
      expect(Object.isFrozen(all)).toBe(true)
    })

    it('serves from cache without re-querying DB after first call', async () => {
      mockSelect.mockResolvedValue({
        data: [{ key: 'allow_user_upload', value: false }],
        error: null
      })

      const { readAllSettings } = await loadModule()
      await readAllSettings()
      await readAllSettings()
      await readAllSettings()
      expect(mockSelect).toHaveBeenCalledTimes(1)
    })
  })
})
