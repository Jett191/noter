/**
 * Unit tests · requireAdmin
 *
 * Task 16.1 (tasks.md): 单元测试:requireAdmin 在各 (role, not_active, deleted) 组合下的判定
 *
 * 覆盖以下分支(对应 design.md §Architecture / Requirements 1, 2):
 *   1. 无 cookie session / auth.getUser 返回 error → UnauthorizedError
 *   2. session 通过但 profiles 查询失败 / 命中 0 行 → UnauthorizedError
 *   3. role × not_active × deleted 组合矩阵的判定
 *      - role='admin'/'super_admin' AND not_active=0 AND deleted=0 → 通过
 *      - role='user' / 任一状态非零 → UnauthorizedError
 *   4. user.email 缺失时回退为空串
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// 必须在源文件 import 'server-only' 之前 stub 该模块,否则会触发 throw
vi.mock('server-only', () => ({}))

// 通过 vi.hoisted 让 mock 工厂可以引用这些变量(vi.mock 会被静态提升到 import 之上)
const { mockGetUser, mockSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSingle: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser
    }
  }))
}))

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle
        })
      })
    })
  }))
}))

// 在 mock 之后导入被测模块与真实错误类型
import { requireAdmin } from './requireAdmin'
import { UnauthorizedError } from '../http/handler'

const TEST_USER = { id: 'user-uuid-1', email: 'admin@example.com' }

describe('requireAdmin', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockSingle.mockReset()
  })

  // ===== 1. session 校验失败分支 =====

  describe('session validation', () => {
    it('throws UnauthorizedError when auth.getUser returns no user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
      await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
      // profiles 应当根本不被查询
      expect(mockSingle).not.toHaveBeenCalled()
    })

    it('throws UnauthorizedError when auth.getUser returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'session expired' }
      })
      await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
      expect(mockSingle).not.toHaveBeenCalled()
    })
  })

  // ===== 2. profile 查询失败分支 =====

  describe('profile lookup', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: TEST_USER }, error: null })
    })

    it('throws UnauthorizedError when profile row is not found', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'PGRST116', code: 'PGRST116' }
      })
      await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('throws UnauthorizedError when profile query returns null without error', async () => {
      // 防御性场景:某些边界下 supabase-js 可能 data=null 且 error=null
      mockSingle.mockResolvedValue({ data: null, error: null })
      await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
    })
  })

  // ===== 3. role × not_active × deleted 组合矩阵 =====

  describe('role × not_active × deleted matrix', () => {
    interface MatrixCase {
      role: string
      not_active: number
      deleted: number
      shouldPass: boolean
    }

    // 设计文档要求:role IN ('admin','super_admin') AND not_active=0 AND deleted=0
    const cases: MatrixCase[] = [
      // role='user' 永远拒绝(无论状态)
      { role: 'user', not_active: 0, deleted: 0, shouldPass: false },
      { role: 'user', not_active: 1, deleted: 0, shouldPass: false },
      { role: 'user', not_active: 0, deleted: 1, shouldPass: false },
      { role: 'user', not_active: 1, deleted: 1, shouldPass: false },

      // role='admin'
      { role: 'admin', not_active: 0, deleted: 0, shouldPass: true },
      { role: 'admin', not_active: 1, deleted: 0, shouldPass: false },
      { role: 'admin', not_active: 0, deleted: 1, shouldPass: false },
      { role: 'admin', not_active: 1, deleted: 1, shouldPass: false },

      // role='super_admin'
      { role: 'super_admin', not_active: 0, deleted: 0, shouldPass: true },
      { role: 'super_admin', not_active: 1, deleted: 0, shouldPass: false },
      { role: 'super_admin', not_active: 0, deleted: 1, shouldPass: false },
      { role: 'super_admin', not_active: 1, deleted: 1, shouldPass: false },

      // 未知角色字符串(防御性)
      { role: 'guest', not_active: 0, deleted: 0, shouldPass: false },
      { role: '', not_active: 0, deleted: 0, shouldPass: false }
    ]

    for (const c of cases) {
      const verb = c.shouldPass ? 'returns AdminContext' : 'throws UnauthorizedError'
      it(`role='${c.role}' not_active=${c.not_active} deleted=${c.deleted} → ${verb}`, async () => {
        mockGetUser.mockResolvedValue({
          data: { user: TEST_USER },
          error: null
        })
        mockSingle.mockResolvedValue({
          data: { role: c.role, not_active: c.not_active, deleted: c.deleted },
          error: null
        })

        if (c.shouldPass) {
          const ctx = await requireAdmin()
          expect(ctx).toEqual({
            userId: TEST_USER.id,
            email: TEST_USER.email,
            role: c.role
          })
        } else {
          await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError)
        }
      })
    }
  })

  // ===== 4. AdminContext 字段细节 =====

  describe('AdminContext shape', () => {
    it('returns email as empty string when user.email is undefined', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: TEST_USER.id, email: undefined } },
        error: null
      })
      mockSingle.mockResolvedValue({
        data: { role: 'admin', not_active: 0, deleted: 0 },
        error: null
      })

      const ctx = await requireAdmin()
      expect(ctx).toEqual({
        userId: TEST_USER.id,
        email: '',
        role: 'admin'
      })
    })

    it('returns email as empty string when user.email is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: TEST_USER.id, email: null } },
        error: null
      })
      mockSingle.mockResolvedValue({
        data: { role: 'super_admin', not_active: 0, deleted: 0 },
        error: null
      })

      const ctx = await requireAdmin()
      expect(ctx.email).toBe('')
      expect(ctx.role).toBe('super_admin')
    })
  })
})
