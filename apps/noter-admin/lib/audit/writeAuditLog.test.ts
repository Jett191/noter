/**
 * Unit tests · writeAuditLog
 *
 * Task 16.2 (tasks.md): 单元测试:writeAuditLog 在 audit_log_enabled=true/false 下的行为
 *
 * 关键不变量(对应 design.md §3 Components / writeAuditLog、Requirements 23):
 *   1. audit_log_enabled=true → INSERT admin_audit_logs 被执行
 *   2. audit_log_enabled=false → INSERT 被跳过(仅 console.info skip 提示)
 *   3. force=true → 始终 INSERT,绕过开关检查(用于 system_settings.update 切换 audit_log_enabled 自身)
 *   4. INSERT 返回 error → 仅 console.error,函数仍然 resolve(永不抛错)
 *   5. readSetting 抛错时仍走兜底 try/catch,不影响主响应
 *   6. request_ip 从 X-Forwarded-For / X-Real-IP / Forwarded 按优先级提取
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockReadSetting, mockInsert } = vi.hoisted(() => ({
  mockReadSetting: vi.fn(),
  mockInsert: vi.fn()
}))

vi.mock('../settings/readSetting', () => ({
  readSetting: mockReadSetting
}))

vi.mock('../supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert
    }))
  }))
}))

import { writeAuditLog } from './writeAuditLog'

const BASE_INPUT = {
  adminUserId: 'admin-uuid-1',
  adminEmail: 'admin@example.com',
  actionType: 'user.block',
  targetResourceType: 'user',
  targetResourceId: 'target-uuid-1',
  targetResourceLabel: 'target@example.com'
} as const

describe('writeAuditLog', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockReadSetting.mockReset()
    mockInsert.mockReset()
    mockInsert.mockResolvedValue({ error: null })
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // 必须显式恢复 console 间谍,否则 vi.spyOn 会层层叠加,
    // 导致后续测试中的一次 console.error 调用被多个 spy 计入。
    consoleInfoSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  // ===== 1. audit_log_enabled=true =====

  describe('when audit_log_enabled=true', () => {
    beforeEach(() => {
      mockReadSetting.mockResolvedValue(true)
    })

    it('executes INSERT into admin_audit_logs', async () => {
      await writeAuditLog({ ...BASE_INPUT })

      expect(mockReadSetting).toHaveBeenCalledWith('audit_log_enabled')
      expect(mockInsert).toHaveBeenCalledTimes(1)
      const inserted = mockInsert.mock.calls[0][0]
      expect(inserted).toMatchObject({
        admin_user_id: BASE_INPUT.adminUserId,
        admin_email: BASE_INPUT.adminEmail,
        action_type: BASE_INPUT.actionType,
        target_resource_type: BASE_INPUT.targetResourceType,
        target_resource_id: BASE_INPUT.targetResourceId,
        target_resource_label: BASE_INPUT.targetResourceLabel,
        metadata: {}
      })
    })

    it('uses default null/{} for omitted optional fields', async () => {
      await writeAuditLog({
        adminUserId: 'a-1',
        adminEmail: 'a@x.com',
        actionType: 'system_settings.update',
        targetResourceType: 'system_settings'
      })

      const inserted = mockInsert.mock.calls[0][0]
      expect(inserted.target_resource_id).toBeNull()
      expect(inserted.target_resource_label).toBeNull()
      expect(inserted.metadata).toEqual({})
      expect(inserted.request_ip).toBeNull()
    })

    it('passes through metadata payload', async () => {
      await writeAuditLog({
        ...BASE_INPUT,
        metadata: { reason: 'spam', triggeredBy: 'admin@example.com' }
      })

      const inserted = mockInsert.mock.calls[0][0]
      expect(inserted.metadata).toEqual({
        reason: 'spam',
        triggeredBy: 'admin@example.com'
      })
    })
  })

  // ===== 2. audit_log_enabled=false =====

  describe('when audit_log_enabled=false', () => {
    beforeEach(() => {
      mockReadSetting.mockResolvedValue(false)
    })

    it('skips INSERT and logs an info-level skip message', async () => {
      await writeAuditLog({ ...BASE_INPUT })

      expect(mockReadSetting).toHaveBeenCalledWith('audit_log_enabled')
      expect(mockInsert).not.toHaveBeenCalled()
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
      const logged = consoleInfoSpy.mock.calls[0][0] as string
      expect(logged).toContain('skipped')
      expect(logged).toContain(BASE_INPUT.actionType)
    })

    it('still resolves without throwing', async () => {
      await expect(writeAuditLog({ ...BASE_INPUT })).resolves.toBeUndefined()
    })
  })

  // ===== 3. force=true 绕过开关 =====

  describe('force=true bypass', () => {
    it('executes INSERT even when audit_log_enabled=false', async () => {
      mockReadSetting.mockResolvedValue(false)

      await writeAuditLog({
        ...BASE_INPUT,
        actionType: 'system_settings.update',
        targetResourceType: 'system_settings',
        force: true
      })

      // force=true 时 readSetting 不应被调用
      expect(mockReadSetting).not.toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })

    it('executes INSERT when force=true regardless of setting value', async () => {
      // force=true 且 enabled=true 也应当 INSERT,且不读取 setting
      mockReadSetting.mockResolvedValue(true)

      await writeAuditLog({ ...BASE_INPUT, force: true })

      expect(mockReadSetting).not.toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })
  })

  // ===== 4. INSERT 失败 → 仅 console.error,不抛错 =====

  describe('error handling never throws', () => {
    it('logs and swallows when INSERT returns an error', async () => {
      mockReadSetting.mockResolvedValue(true)
      mockInsert.mockResolvedValue({
        error: { message: 'duplicate key', code: '23505' }
      })

      await expect(writeAuditLog({ ...BASE_INPUT })).resolves.toBeUndefined()

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const logged = consoleErrorSpy.mock.calls[0][0] as string
      expect(logged).toContain('write failed')
      expect(logged).toContain('duplicate key')
    })

    it('logs and swallows when readSetting throws', async () => {
      mockReadSetting.mockRejectedValue(new Error('settings backend down'))

      await expect(writeAuditLog({ ...BASE_INPUT })).resolves.toBeUndefined()

      // INSERT should not be attempted when the pre-check throws
      expect(mockInsert).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const logged = consoleErrorSpy.mock.calls[0][0] as string
      expect(logged).toContain('unexpected exception')
      expect(logged).toContain('settings backend down')
    })

    it('logs and swallows when supabase insert throws synchronously', async () => {
      mockReadSetting.mockResolvedValue(true)
      mockInsert.mockImplementation(() => {
        throw new Error('connection refused')
      })

      await expect(writeAuditLog({ ...BASE_INPUT })).resolves.toBeUndefined()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ===== 5. request_ip 提取 =====

  describe('request IP extraction', () => {
    beforeEach(() => {
      mockReadSetting.mockResolvedValue(true)
    })

    it('reads first segment of X-Forwarded-For', async () => {
      const request = new Request('https://x.test/', {
        headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178' }
      })
      await writeAuditLog({ ...BASE_INPUT, request })
      expect(mockInsert.mock.calls[0][0].request_ip).toBe('203.0.113.5')
    })

    it('falls back to X-Real-IP when X-Forwarded-For is absent', async () => {
      const request = new Request('https://x.test/', {
        headers: { 'x-real-ip': '198.51.100.7' }
      })
      await writeAuditLog({ ...BASE_INPUT, request })
      expect(mockInsert.mock.calls[0][0].request_ip).toBe('198.51.100.7')
    })

    it('falls back to Forwarded header when others are absent', async () => {
      const request = new Request('https://x.test/', {
        headers: { forwarded: 'for=192.0.2.43; proto=https' }
      })
      await writeAuditLog({ ...BASE_INPUT, request })
      expect(mockInsert.mock.calls[0][0].request_ip).toBe('192.0.2.43')
    })

    it('returns null when no IP-related header is present', async () => {
      const request = new Request('https://x.test/')
      await writeAuditLog({ ...BASE_INPUT, request })
      expect(mockInsert.mock.calls[0][0].request_ip).toBeNull()
    })

    it('returns null when request is omitted', async () => {
      await writeAuditLog({ ...BASE_INPUT })
      expect(mockInsert.mock.calls[0][0].request_ip).toBeNull()
    })
  })
})
