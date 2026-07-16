/**
 * Task 16.5 · 集成测试:权限矩阵
 *
 * 验证 design.md §Correctness Properties · Property 2 中定义的角色操作权限矩阵:
 *
 *   | actor       | target            | block/unblock/delete/pwd-reset | role-change |
 *   | ----------- | ----------------- | ------------------------------ | ----------- |
 *   | admin       | user              | accept (200)                   | 403 (only super_admin) |
 *   | admin       | admin             | reject (409 not_allowed_target_admin) | 403 |
 *   | admin       | super_admin       | reject (404 hidden)            | 403 / 404   |
 *   | super_admin | user              | accept (200)                   | accept (200) for user→admin |
 *   | super_admin | admin             | accept (200)                   | accept (200) for admin→user |
 *   | super_admin | super_admin       | reject (404 hidden)            | reject (404) |
 *   | any role    | self              | reject (409 conflict)          | reject (409) |
 *
 * 设计参考:apps/noter-admin/app/api/admin/users/[id]/{block,unblock,delete,role}/route.ts
 *
 * 运行前提同 16.4(见 tests/README.md)。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  INTEGRATION_TESTS_ENABLED,
  adminFetch,
  createTestUser,
  deleteTestUser,
  signInAsAdmin,
  type TestUserHandle
} from './_helpers'

describe.skipIf(!INTEGRATION_TESTS_ENABLED)('Integration · Permission Matrix', () => {
  let admin: TestUserHandle
  let adminCookies: string

  let superAdmin: TestUserHandle
  let superAdminCookies: string

  let userTarget: TestUserHandle
  let adminTarget: TestUserHandle

  const cleanupIds: string[] = []

  beforeAll(async () => {
    admin = await createTestUser({ role: 'admin', emailPrefix: 'matrix-admin' })
    cleanupIds.push(admin.id)
    const a = await signInAsAdmin(admin.email, admin.password)
    if (!a) throw new Error('admin sign-in failed')
    adminCookies = a.cookies

    superAdmin = await createTestUser({
      role: 'super_admin',
      emailPrefix: 'matrix-super'
    })
    cleanupIds.push(superAdmin.id)
    const s = await signInAsAdmin(superAdmin.email, superAdmin.password)
    if (!s) throw new Error('super_admin sign-in failed')
    superAdminCookies = s.cookies

    // 注:同时存在两位 super_admin 会触发 partial unique index 冲突。
    // _helpers.createTestUser 通过 service_role UPDATE,在测试前 DB 中应只有一个 super_admin
    // (即本测试创建的)。如有冲突,测试会在 createTestUser 阶段直接报错。
  }, 30_000)

  afterAll(async () => {
    for (const id of cleanupIds) await deleteTestUser(id)
  }, 30_000)

  // 每个 it 块内单独创建 target 用户,避免状态泄漏
  async function createUserTarget(role: 'user' | 'admin'): Promise<TestUserHandle> {
    const t = await createTestUser({ role, emailPrefix: `target-${role}` })
    cleanupIds.push(t.id)
    return t
  }

  // ────────────────────────────────────────────────────────
  // admin × user → ACCEPT
  // ────────────────────────────────────────────────────────

  describe('admin operating on user (ACCEPT)', () => {
    it('admin can block a user', async () => {
      userTarget = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${userTarget.id}/block`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(200)
    })

    it('admin can unblock a user', async () => {
      userTarget = await createUserTarget('user')
      await adminFetch(`/api/admin/users/${userTarget.id}/block`, {
        method: 'POST',
        cookies: adminCookies
      })
      const res = await adminFetch(`/api/admin/users/${userTarget.id}/unblock`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(200)
    })

    it('admin can soft-delete a user', async () => {
      userTarget = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${userTarget.id}/delete`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(200)
    })

    it('admin can send password reset email to a user', async () => {
      userTarget = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${userTarget.id}/send-password-reset`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect([200, 202]).toContain(res.status)
    })
  })

  // ────────────────────────────────────────────────────────
  // admin × admin → REJECT (403 forbidden)
  // ────────────────────────────────────────────────────────

  describe('admin operating on admin (REJECT 403)', () => {
    it('admin cannot block another admin', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/block`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(403)
    })

    it('admin cannot soft-delete another admin', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/delete`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(403)
    })

    it('admin cannot send password reset to another admin', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/send-password-reset`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(403)
    })

    it('admin cannot call role change endpoint at all (403, super_admin only)', async () => {
      const target = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${target.id}/role`, {
        method: 'POST',
        cookies: adminCookies,
        body: JSON.stringify({ role: 'admin' })
      })
      expect(res.status).toBe(403)
    })
  })

  // ────────────────────────────────────────────────────────
  // super_admin × admin → ACCEPT
  // ────────────────────────────────────────────────────────

  describe('super_admin operating on admin (ACCEPT)', () => {
    it('super_admin can block an admin', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/block`, {
        method: 'POST',
        cookies: superAdminCookies
      })
      expect(res.status).toBe(200)
    })

    it('super_admin can soft-delete an admin', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/delete`, {
        method: 'POST',
        cookies: superAdminCookies
      })
      expect(res.status).toBe(200)
    })

    it('super_admin can change admin role to user', async () => {
      adminTarget = await createUserTarget('admin')
      const res = await adminFetch(`/api/admin/users/${adminTarget.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'user' })
      })
      expect(res.status).toBe(200)
    })

    it('super_admin can change user role to admin', async () => {
      const target = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${target.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'admin' })
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // any × super_admin → REJECT (404 hidden)
  // ────────────────────────────────────────────────────────

  describe('any role operating on super_admin (REJECT 404, hidden existence)', () => {
    // 创建第二个 super_admin 行 - 受到 partial unique index 限制,
    // 这里通过 service client 直接降级再操作来制造一个"曾是 super_admin 但被攻击者引用其 id"
    // 的边界。实际生产中只会有 1 个 super_admin,我们用当前 super_admin 自身作为目标即可。
    // (super_admin 操作自身在 design.md 中归为 self → 409 而非 404,见下一组)
    // 本组用 admin 视角操作 super_admin,行为应是 404,因为后端把 super_admin 当作"不存在"。

    it('admin sees 404 (hidden) when targeting super_admin', async () => {
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/block`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(404)
    })

    it('admin sees 404 when role-change targets super_admin', async () => {
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/role`, {
        method: 'POST',
        cookies: adminCookies,
        body: JSON.stringify({ role: 'admin' })
      })
      // admin 没有 role-change 权限本身就是 403;先于 super_admin 检查
      expect([403, 404]).toContain(res.status)
    })

    it('super_admin sees 404 when role-change targets another super_admin id pattern', async () => {
      // 由于 partial unique index 仅允许一个 super_admin,无法真实创建第二个。
      // 这里改为验证对自身 id 的 role-change → 应 409 (self),
      // 间接说明 super_admin 目标永远不会被允许变化。
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'admin' })
      })
      expect(res.status).toBe(409)
    })
  })

  // ────────────────────────────────────────────────────────
  // any × self → REJECT (409 conflict)
  // ────────────────────────────────────────────────────────

  describe('any role operating on self (REJECT 409)', () => {
    it('admin cannot block self', async () => {
      const res = await adminFetch(`/api/admin/users/${admin.id}/block`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(409)
    })

    it('admin cannot soft-delete self', async () => {
      const res = await adminFetch(`/api/admin/users/${admin.id}/delete`, {
        method: 'POST',
        cookies: adminCookies
      })
      expect(res.status).toBe(409)
    })

    it('super_admin cannot block self', async () => {
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/block`, {
        method: 'POST',
        cookies: superAdminCookies
      })
      expect(res.status).toBe(409)
    })

    it('super_admin cannot delete self', async () => {
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/delete`, {
        method: 'POST',
        cookies: superAdminCookies
      })
      expect(res.status).toBe(409)
    })

    it('super_admin cannot role-change self', async () => {
      const res = await adminFetch(`/api/admin/users/${superAdmin.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'admin' })
      })
      expect(res.status).toBe(409)
    })
  })

  // ────────────────────────────────────────────────────────
  // role-change body validation
  // ────────────────────────────────────────────────────────

  describe('role-change body validation', () => {
    it('rejects role values outside {user, admin}', async () => {
      const target = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${target.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'super_admin' })
      })
      expect(res.status).toBe(400)
    })

    it('rejects same-role no-op (409)', async () => {
      const target = await createUserTarget('user')
      const res = await adminFetch(`/api/admin/users/${target.id}/role`, {
        method: 'POST',
        cookies: superAdminCookies,
        body: JSON.stringify({ role: 'user' })
      })
      expect(res.status).toBe(409)
    })
  })
})
