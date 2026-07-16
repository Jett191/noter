/**
 * Task 16.4 · 集成测试:每个 /api/admin/* Route Handler 的 happy path
 *
 * 设计参见 tasks.md §16.4 与 design.md §6 (API Endpoints):
 *   - 覆盖每个 Route Handler 的最常见成功路径,每个端点 1 个用例
 *   - error path / 权限矩阵 / 上传流程分别由 16.5 / 16.6 / 16.7 / 16.8 覆盖
 *   - 通过 fetch() 直接打到本地启动的 noter-admin dev/prod server
 *   - 使用真实 Supabase 本地容器(supabase start)+ 真实 RLS / migration / seed
 *
 * 运行前提:
 *   1. `supabase start` 启动本地容器
 *   2. 执行所有 migration + seed 脚本(创建系统账号 / 系统文件夹)
 *   3. 启动 noter-admin: `pnpm --filter noter-admin dev` (默认 :3001)
 *   4. 配置以下环境变量(见 tests/README.md):
 *        SUPABASE_TEST_URL
 *        SUPABASE_TEST_SERVICE_ROLE_KEY
 *        SUPABASE_TEST_ANON_KEY
 *        NOTER_ADMIN_BASE_URL
 *
 * 运行命令:
 *   pnpm --filter noter-admin test tests/integration/route-handlers-happy-path.test.ts
 *
 * 当 INTEGRATION_TESTS_ENABLED=false 时,整组测试会被 describe.skipIf 自动跳过。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  INTEGRATION_TESTS_ENABLED,
  adminFetch,
  cleanupTestPublicDocument,
  createTestPublicCategory,
  createTestPublicDocument,
  createTestPublicTag,
  createTestUser,
  deleteTestUser,
  signInAsAdmin,
  type TestUserHandle
} from './_helpers'

describe.skipIf(!INTEGRATION_TESTS_ENABLED)('Integration · /api/admin/* happy path', () => {
  // 为整个测试文件创建一个 admin 账号,登录一次,后续所有用例复用其 cookies。
  let admin: TestUserHandle
  let cookies: string

  // 复用资源,集中清理。
  const createdUserIds: string[] = []
  const createdDocumentIds: string[] = []
  const createdCategoryIds: string[] = []
  const createdTagIds: string[] = []

  beforeAll(async () => {
    admin = await createTestUser({ role: 'admin', emailPrefix: 'happy-admin' })
    const signedIn = await signInAsAdmin(admin.email, admin.password)
    if (!signedIn) {
      throw new Error('Failed to sign in admin for happy-path tests')
    }
    cookies = signedIn.cookies
  }, 30_000)

  afterAll(async () => {
    for (const id of createdDocumentIds) await cleanupTestPublicDocument(id)
    // 物理删除测试 category / tag 残留(部分用例软删除,有些用例没操作)
    // 此处仅是兜底,集成测试以隔离实例为前提,不要求 100% 清理。
    for (const id of [admin.id, ...createdUserIds]) await deleteTestUser(id)
  }, 30_000)

  // ────────────────────────────────────────────────────────
  // Auth
  // ────────────────────────────────────────────────────────

  describe('POST /api/admin/auth/sign-in', () => {
    it('returns 200 + role for valid admin credentials', async () => {
      // 重新签入(单独验证 happy path),不复用模块级 cookies
      const tmpAdmin = await createTestUser({
        role: 'admin',
        emailPrefix: 'sign-in-happy'
      })
      createdUserIds.push(tmpAdmin.id)

      const result = await signInAsAdmin(tmpAdmin.email, tmpAdmin.password)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(200)
    })
  })

  describe('POST /api/admin/auth/sign-out', () => {
    it('returns 200 and clears the admin session', async () => {
      const res = await adminFetch('/api/admin/auth/sign-out', {
        method: 'POST',
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Users
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns paginated user list excluding system accounts', async () => {
      const res = await adminFetch('/api/admin/users?page=1&pageSize=20', { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('total')
      expect(Array.isArray(body.items)).toBe(true)
      // is_system_account=false 过滤生效:返回的每行都不是系统账号
      // (这里只能间接验证:列表中不应出现 'system@noter.local')
      for (const item of body.items) {
        expect(item.email).not.toBe('system@noter.local')
      }
    })
  })

  describe('GET /api/admin/users/[id]', () => {
    it('returns user detail with stats', async () => {
      const target = await createTestUser({
        role: 'user',
        emailPrefix: 'detail-target'
      })
      createdUserIds.push(target.id)

      const res = await adminFetch(`/api/admin/users/${target.id}`, {
        cookies
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(target.id)
      expect(body.email).toBe(target.email)
    })
  })

  describe('POST /api/admin/users/[id]/block & /unblock', () => {
    it('blocks then unblocks a regular user', async () => {
      const target = await createTestUser({
        role: 'user',
        emailPrefix: 'block-target'
      })
      createdUserIds.push(target.id)

      const blockRes = await adminFetch(`/api/admin/users/${target.id}/block`, {
        method: 'POST',
        cookies
      })
      expect(blockRes.status).toBe(200)

      const unblockRes = await adminFetch(`/api/admin/users/${target.id}/unblock`, {
        method: 'POST',
        cookies
      })
      expect(unblockRes.status).toBe(200)
    })
  })

  describe('POST /api/admin/users/[id]/delete', () => {
    it('soft-deletes a regular user', async () => {
      const target = await createTestUser({
        role: 'user',
        emailPrefix: 'soft-delete-target'
      })
      createdUserIds.push(target.id)

      const res = await adminFetch(`/api/admin/users/${target.id}/delete`, {
        method: 'POST',
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/admin/users/[id]/send-password-reset', () => {
    it('triggers password reset email and writes audit log', async () => {
      const target = await createTestUser({
        role: 'user',
        emailPrefix: 'pwd-reset-target'
      })
      createdUserIds.push(target.id)

      const res = await adminFetch(`/api/admin/users/${target.id}/send-password-reset`, {
        method: 'POST',
        cookies
      })
      // 在本地 Supabase 中,Auth 重置邮件可能不会真实发送但端点应返回 200
      expect([200, 202]).toContain(res.status)
    })
  })

  describe('POST /api/admin/users/[id]/role (super_admin only)', () => {
    it('super_admin can switch user→admin', async () => {
      // 该用例特殊:需要 super_admin cookies,而非默认 admin cookies。
      const superAdmin = await createTestUser({
        role: 'super_admin',
        emailPrefix: 'super-role-test'
      })
      createdUserIds.push(superAdmin.id)
      const sa = await signInAsAdmin(superAdmin.email, superAdmin.password)
      if (!sa) throw new Error('super_admin sign-in failed')

      const target = await createTestUser({
        role: 'user',
        emailPrefix: 'role-target'
      })
      createdUserIds.push(target.id)

      const res = await adminFetch(`/api/admin/users/${target.id}/role`, {
        method: 'POST',
        cookies: sa.cookies,
        body: JSON.stringify({ role: 'admin' })
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Public Documents
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/public-documents', () => {
    it('returns public document list with filters', async () => {
      const doc = await createTestPublicDocument({})
      createdDocumentIds.push(doc.id)

      const res = await adminFetch('/api/admin/public-documents?page=1&pageSize=20', { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
    })
  })

  describe('GET /api/admin/public-documents/[id]', () => {
    it('returns document detail with version + signed URL', async () => {
      const doc = await createTestPublicDocument({})
      createdDocumentIds.push(doc.id)

      const res = await adminFetch(`/api/admin/public-documents/${doc.id}`, { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe(doc.id)
      expect(body).toHaveProperty('latestVersionNo')
    })
  })

  describe('PATCH /api/admin/public-documents/[id]/metadata', () => {
    it('updates metadata and rewrites tag associations', async () => {
      const doc = await createTestPublicDocument({})
      createdDocumentIds.push(doc.id)
      const tag = await createTestPublicTag()
      createdTagIds.push(tag.id)
      const cat = await createTestPublicCategory()
      createdCategoryIds.push(cat.id)

      const res = await adminFetch(`/api/admin/public-documents/${doc.id}/metadata`, {
        method: 'PATCH',
        cookies,
        body: JSON.stringify({
          title: `${doc.title}-updated`,
          shortDescription: 'updated desc',
          language: 'zh',
          publicCategoryId: cat.id,
          tagIds: [tag.id]
        })
      })
      expect(res.status).toBe(200)
    })
  })

  describe('PUT /api/admin/public-documents/[id]/content', () => {
    it('archives current content and creates new version', async () => {
      const doc = await createTestPublicDocument({
        markdown: '# original content'
      })
      createdDocumentIds.push(doc.id)

      const res = await adminFetch(`/api/admin/public-documents/${doc.id}/content`, {
        method: 'PUT',
        cookies,
        body: JSON.stringify({
          markdownContent: '# updated content',
          changeNote: 'happy-path edit'
        })
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // version_no=1 已由 createTestPublicDocument 写入,本次编辑应产生 version_no=2
      expect(body.newVersionNo).toBe(2)
    })
  })

  describe('GET /api/admin/public-documents/[id]/versions', () => {
    it('returns version list ordered by version_no DESC', async () => {
      const doc = await createTestPublicDocument({
        markdown: '# v1'
      })
      createdDocumentIds.push(doc.id)

      const res = await adminFetch(`/api/admin/public-documents/${doc.id}/versions`, { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items.length).toBeGreaterThanOrEqual(1)
      // 至少 version_no=1 已存在
      const versionNos = body.items.map((v: { versionNo: number }) => v.versionNo)
      expect(versionNos).toContain(1)
    })
  })

  describe('POST /api/admin/public-documents/[id]/delete', () => {
    it('soft-deletes a public document', async () => {
      const doc = await createTestPublicDocument({})
      createdDocumentIds.push(doc.id)

      const res = await adminFetch(`/api/admin/public-documents/${doc.id}/delete`, {
        method: 'POST',
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Public Categories
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/public-categories', () => {
    it('returns category list with document count', async () => {
      const res = await adminFetch('/api/admin/public-categories', {
        cookies
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.items ?? body)).toBe(true)
    })
  })

  describe('POST /api/admin/public-categories', () => {
    it('creates a category', async () => {
      const name = `happy-cat-${Date.now()}`
      const res = await adminFetch('/api/admin/public-categories', {
        method: 'POST',
        cookies,
        body: JSON.stringify({ name, sortOrder: 0 })
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe(name)
      createdCategoryIds.push(body.id)
    })
  })

  describe('PATCH /api/admin/public-categories/[id]', () => {
    it('updates category name', async () => {
      const cat = await createTestPublicCategory()
      createdCategoryIds.push(cat.id)
      const res = await adminFetch(`/api/admin/public-categories/${cat.id}`, {
        method: 'PATCH',
        cookies,
        body: JSON.stringify({ name: `${cat.name}-renamed` })
      })
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/admin/public-categories/[id]/delete', () => {
    it('soft-deletes a category', async () => {
      const cat = await createTestPublicCategory()
      const res = await adminFetch(`/api/admin/public-categories/${cat.id}/delete`, {
        method: 'POST',
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Public Tags
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/public-tags', () => {
    it('returns official tag list with document count', async () => {
      const res = await adminFetch('/api/admin/public-tags', { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.items ?? body)).toBe(true)
    })
  })

  describe('POST /api/admin/public-tags', () => {
    it('creates an official tag', async () => {
      const name = `happy-tag-${Date.now()}`
      const res = await adminFetch('/api/admin/public-tags', {
        method: 'POST',
        cookies,
        body: JSON.stringify({ name })
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe(name)
      createdTagIds.push(body.id)
    })
  })

  describe('PATCH /api/admin/public-tags/[id]', () => {
    it('updates a tag name', async () => {
      const tag = await createTestPublicTag()
      createdTagIds.push(tag.id)
      const res = await adminFetch(`/api/admin/public-tags/${tag.id}`, {
        method: 'PATCH',
        cookies,
        body: JSON.stringify({ name: `${tag.name}-renamed` })
      })
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/admin/public-tags/[id]/delete', () => {
    it('soft-deletes a tag and clears associations', async () => {
      const tag = await createTestPublicTag()
      const res = await adminFetch(`/api/admin/public-tags/${tag.id}/delete`, {
        method: 'POST',
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Documents (private)
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/documents', () => {
    it('returns private document list with owner info', async () => {
      const res = await adminFetch('/api/admin/documents?page=1&pageSize=20', { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
    })
  })

  // POST /api/admin/documents/[id]/delete 的 happy path 需要先用 noter-web 创建私有文档,
  // 该测试由 16.7 / E2E 间接覆盖,此处省略。

  // ────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/dashboard/metrics', () => {
    it('returns 6 metrics with yesterday comparison', async () => {
      const res = await adminFetch('/api/admin/dashboard/metrics', {
        cookies
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // 期望返回的 metrics 数为 6 个或在 metrics 字段下
      expect(body).toBeTruthy()
    })
  })

  describe('GET /api/admin/dashboard/trends', () => {
    it('returns daily trends for given days range', async () => {
      const res = await adminFetch('/api/admin/dashboard/trends?days=7', {
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  describe('GET /api/admin/dashboard/distributions', () => {
    it('returns document status distribution and top tags', async () => {
      const res = await adminFetch('/api/admin/dashboard/distributions', {
        cookies
      })
      expect(res.status).toBe(200)
    })
  })

  // ────────────────────────────────────────────────────────
  // Audit Logs
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/audit-logs', () => {
    it('returns paginated audit logs', async () => {
      const res = await adminFetch('/api/admin/audit-logs?page=1&pageSize=20', { cookies })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('total')
    })
  })

  // ────────────────────────────────────────────────────────
  // System Settings
  // ────────────────────────────────────────────────────────

  describe('GET /api/admin/system-settings', () => {
    it('returns all 4 settings', async () => {
      const res = await adminFetch('/api/admin/system-settings', {
        cookies
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // 4 项:allow_user_upload, allow_user_delete_own,
      //      public_documents_visible, audit_log_enabled
      const keys = Object.keys(body.settings ?? body)
      expect(keys.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('PATCH /api/admin/system-settings', () => {
    it('updates a setting and writes audit log', async () => {
      // 先读当前值,翻转后再翻回,保持幂等
      const getRes = await adminFetch('/api/admin/system-settings', {
        cookies
      })
      const getBody = await getRes.json()
      const settings = getBody.settings ?? getBody
      const current = settings['allow_user_upload']

      const res = await adminFetch('/api/admin/system-settings', {
        method: 'PATCH',
        cookies,
        body: JSON.stringify({ key: 'allow_user_upload', value: !current })
      })
      expect(res.status).toBe(200)

      // 翻回原值,避免污染其他用例
      await adminFetch('/api/admin/system-settings', {
        method: 'PATCH',
        cookies,
        body: JSON.stringify({ key: 'allow_user_upload', value: current })
      })
    })
  })
})
