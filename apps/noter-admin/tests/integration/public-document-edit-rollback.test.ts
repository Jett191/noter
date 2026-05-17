/**
 * Task 16.7 · 集成测试:公共文档在线编辑 → 版本归档 → 回滚 → 异步派生
 *
 * 验证 design.md §Correctness Properties · Property 3 (版本号严格递增)与 §7.3 / §7.4。
 *
 * 流程:
 *   1. 通过 _helpers.createTestPublicDocument 直接创建一份 status=ready 的文档(已写入 v1)
 *   2. PUT /content (md=v2-content) → 归档当前(实际上是 v1 的 markdown)为 version_no=2
 *      - 返回 newVersionNo=2;status=processing(异步派生 pipeline 触发)
 *   3. 再次 PUT /content (md=v3-content) → 归档为 version_no=3
 *   4. POST /versions/2/rollback → 归档当前 (v3-content) 为 version_no=4,内容回到 version_no=2 中存的 markdown
 *   5. GET /versions → 返回 [4, 3, 2, 1] 严格递增
 *   6. PUT /content (md=current) → 返回 noChange:true,不创建版本
 *   7. POST /versions/2/rollback (内容已等于 v2 时) → 409 conflict
 *   8. GET /audit-logs?actionTypes=public_document.content_update,public_document.rollback
 *      → 包含相应条目;metadata 不含完整 markdown
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  INTEGRATION_TESTS_ENABLED,
  adminFetch,
  cleanupTestPublicDocument,
  createTestPublicDocument,
  createTestUser,
  deleteTestUser,
  signInAsAdmin,
  type TestUserHandle
} from './_helpers'

describe.skipIf(!INTEGRATION_TESTS_ENABLED)(
  'Integration · Public Document Edit → Version → Rollback',
  () => {
    let admin: TestUserHandle
    let cookies: string

    const createdDocumentIds: string[] = []

    beforeAll(async () => {
      admin = await createTestUser({ role: 'admin', emailPrefix: 'edit-admin' })
      const a = await signInAsAdmin(admin.email, admin.password)
      if (!a) throw new Error('admin sign-in failed')
      cookies = a.cookies
    }, 30_000)

    afterAll(async () => {
      for (const id of createdDocumentIds) await cleanupTestPublicDocument(id)
      await deleteTestUser(admin.id)
    }, 30_000)

    /** 包装 PUT /content */
    function editContent(
      documentId: string,
      markdownContent: string,
      changeNote?: string
    ): Promise<Response> {
      return adminFetch(`/api/admin/public-documents/${documentId}/content`, {
        method: 'PUT',
        cookies,
        body: JSON.stringify({ markdownContent, changeNote })
      })
    }

    /** 包装 POST /versions/[versionNo]/rollback */
    function rollback(documentId: string, versionNo: number): Promise<Response> {
      return adminFetch(
        `/api/admin/public-documents/${documentId}/versions/${versionNo}/rollback`,
        { method: 'POST', cookies }
      )
    }

    // ────────────────────────────────────────────────────────
    // online edit creates new version
    // ────────────────────────────────────────────────────────

    describe('online edit', () => {
      it('editing content archives old markdown as new version', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1' })
        createdDocumentIds.push(doc.id)

        const res = await editContent(doc.id, '# v2 content', 'first edit')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.newVersionNo).toBe(2)
        expect(body.status).toBe('processing')
      })

      it('no-op edit returns { noChange: true } without creating a version', async () => {
        const doc = await createTestPublicDocument({ markdown: '# stable' })
        createdDocumentIds.push(doc.id)

        const res = await editContent(doc.id, '# stable')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.noChange).toBe(true)

        // 验证版本列表里仍然只有 v1
        const verRes = await adminFetch(`/api/admin/public-documents/${doc.id}/versions`, {
          cookies
        })
        const verBody = await verRes.json()
        expect(verBody.items.length).toBe(1)
        expect(verBody.items[0].versionNo).toBe(1)
      })

      it('version_no increments strictly across multiple edits', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1' })
        createdDocumentIds.push(doc.id)

        // 连续 3 次编辑 → version_no 应为 [1,2,3,4](v1 已存在,3 次编辑各产生 1 个归档版本)
        await editContent(doc.id, '# v2')
        await editContent(doc.id, '# v3')
        await editContent(doc.id, '# v4')

        const verRes = await adminFetch(`/api/admin/public-documents/${doc.id}/versions`, {
          cookies
        })
        const verBody = await verRes.json()
        const versionNos = verBody.items
          .map((v: { versionNo: number }) => v.versionNo)
          .sort((a: number, b: number) => a - b)
        expect(versionNos).toEqual([1, 2, 3, 4])
      })
    })

    // ────────────────────────────────────────────────────────
    // version history listing
    // ────────────────────────────────────────────────────────

    describe('version history', () => {
      it('GET /versions returns items ordered by version_no DESC', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1' })
        createdDocumentIds.push(doc.id)

        await editContent(doc.id, '# v2')
        await editContent(doc.id, '# v3')

        const res = await adminFetch(`/api/admin/public-documents/${doc.id}/versions`, { cookies })
        expect(res.status).toBe(200)
        const body = await res.json()
        const versionNos = body.items.map((v: { versionNo: number }) => v.versionNo)
        // 严格按 DESC 排序
        for (let i = 1; i < versionNos.length; i++) {
          expect(versionNos[i - 1]).toBeGreaterThan(versionNos[i])
        }
      })

      it('GET /versions/[versionNo] returns markdown + editor info', async () => {
        const doc = await createTestPublicDocument({ markdown: '# original' })
        createdDocumentIds.push(doc.id)

        await editContent(doc.id, '# updated', 'test edit')
        // 编辑后应有 version_no=2 归档了原始 '# original'
        const res = await adminFetch(`/api/admin/public-documents/${doc.id}/versions/2`, {
          cookies
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.markdownContent).toBe('# original')
      })
    })

    // ────────────────────────────────────────────────────────
    // rollback
    // ────────────────────────────────────────────────────────

    describe('rollback', () => {
      it('rollback archives current and restores target version', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1-content' })
        createdDocumentIds.push(doc.id)

        // 编辑两次 → 当前内容为 '# v3-content',v2 中存的是 '# v1-content'
        await editContent(doc.id, '# v2-content')
        await editContent(doc.id, '# v3-content')

        // 回滚到 version_no=2(其内容为 '# v1-content')
        const res = await rollback(doc.id, 2)
        expect(res.status).toBe(200)

        // 当前文档详情中 markdown 应回到 '# v1-content'
        const detailRes = await adminFetch(`/api/admin/public-documents/${doc.id}`, { cookies })
        const detail = await detailRes.json()
        expect(detail.markdownContent).toBe('# v1-content')

        // 版本列表中应增加了一个 version_no=4(归档 '# v3-content')
        const verRes = await adminFetch(`/api/admin/public-documents/${doc.id}/versions`, {
          cookies
        })
        const verBody = await verRes.json()
        const versionNos = verBody.items.map((v: { versionNo: number }) => v.versionNo)
        expect(versionNos).toContain(4)
      })

      it('rollback to current content returns 409 (no-op)', async () => {
        const doc = await createTestPublicDocument({ markdown: '# stable' })
        createdDocumentIds.push(doc.id)

        // 编辑一次以创建 v2(归档了 '# stable'),当前内容是 '# changed'
        await editContent(doc.id, '# changed')

        // 再编辑回到原始内容,这样当前内容 == version 2 内容
        await editContent(doc.id, '# stable')

        // 此时回滚到 version_no=2 是 no-op,期望 409
        const res = await rollback(doc.id, 2)
        expect(res.status).toBe(409)
      })

      it('rollback transitions document to processing status', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1' })
        createdDocumentIds.push(doc.id)

        await editContent(doc.id, '# v2')
        const res = await rollback(doc.id, 2)
        expect(res.status).toBe(200)

        // 文档详情 status 为 processing(派生 pipeline 触发后异步)
        const detailRes = await adminFetch(`/api/admin/public-documents/${doc.id}`, { cookies })
        const detail = await detailRes.json()
        // 由于派生 pipeline 是异步的,status 可能是 processing 或在测试运行很慢时已经是 ready;
        // 只要不是 failed 即可
        expect(['processing', 'ready']).toContain(detail.status)
      })
    })

    // ────────────────────────────────────────────────────────
    // audit log
    // ────────────────────────────────────────────────────────

    describe('audit trail', () => {
      it('content_update + rollback actions are logged without full markdown', async () => {
        const doc = await createTestPublicDocument({ markdown: '# v1' })
        createdDocumentIds.push(doc.id)

        await editContent(doc.id, '# v2', 'change A')
        await rollback(doc.id, 2)

        // 给后台 writeAuditLog 一些时间(fire-and-forget)
        await new Promise((r) => setTimeout(r, 800))

        const logsRes = await adminFetch(`/api/admin/audit-logs?page=1&pageSize=50`, { cookies })
        const logsBody = await logsRes.json()
        const docLogs = logsBody.items.filter(
          (item: { targetResourceId?: string }) => item.targetResourceId === doc.id
        )

        const updateLog = docLogs.find(
          (l: { actionType: string }) => l.actionType === 'public_document.content_update'
        )
        const rollbackLog = docLogs.find(
          (l: { actionType: string }) => l.actionType === 'public_document.rollback'
        )
        expect(updateLog).toBeTruthy()
        expect(rollbackLog).toBeTruthy()

        // metadata 不应包含完整 markdown 字段(只允许 versionNo / 长度 / changeNote 等)
        expect(updateLog.metadata).not.toHaveProperty('markdownContent')
        expect(rollbackLog.metadata).not.toHaveProperty('markdownContent')
      })
    })
  }
)
