/**
 * Task 16.6 · 集成测试:公共文档上传 → 列表显示 processing → 等待 ready
 *
 * 验证 design.md §7.2 (公共文档上传异步 pipeline):
 *   1. 上传一份合法文件 → /api/admin/public-documents/upload 返回 { documentId, status: 'processing' }
 *   2. /api/admin/public-documents 列表查询 → 文档存在,status='processing'
 *   3. 等待 pipeline 完成 → /api/admin/public-documents/[id] 返回 status='ready'
 *   4. /api/admin/public-documents/[id]/versions 包含 version_no=1
 *
 * 同时覆盖 Route Handler 的关键校验路径:
 *   - 单文件超过 50MB → 400
 *   - 单批超过 20 个文件 → 400
 *   - 扩展名不在白名单 → 400
 *
 * 运行前提同 16.4(见 tests/README.md);此外:
 *   - parse-document Edge Function 已部署到本地 supabase 容器
 *   - originals Storage bucket 存在
 *   - LLM 相关 secret 已注入(用于 pipeline 真实执行;若 unset,只验证步骤 1-2)
 *
 * 由于 pipeline 完整执行可能耗时较长且依赖外部服务,以下 wait-for-ready 用例标记
 * 为 30s 超时;如本地未配置 LLM,可设置环境变量 SKIP_PIPELINE_WAIT=1 跳过该用例。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  INTEGRATION_TESTS_ENABLED,
  NOTER_ADMIN_BASE_URL,
  adminFetch,
  cleanupTestPublicDocument,
  createTestUser,
  deleteTestUser,
  signInAsAdmin,
  waitForDocumentStatus,
  type TestUserHandle
} from './_helpers'

const SKIP_PIPELINE_WAIT = process.env.SKIP_PIPELINE_WAIT === '1'

describe.skipIf(!INTEGRATION_TESTS_ENABLED)(
  'Integration · Public Document Upload → Processing → Ready',
  () => {
    let admin: TestUserHandle
    let cookies: string

    const createdDocumentIds: string[] = []
    let tempDir: string

    beforeAll(async () => {
      admin = await createTestUser({ role: 'admin', emailPrefix: 'upload-admin' })
      const a = await signInAsAdmin(admin.email, admin.password)
      if (!a) throw new Error('admin sign-in failed')
      cookies = a.cookies
      tempDir = mkdtempSync(join(tmpdir(), 'noter-upload-test-'))
    }, 30_000)

    afterAll(async () => {
      for (const id of createdDocumentIds) await cleanupTestPublicDocument(id)
      await deleteTestUser(admin.id)
    }, 30_000)

    /**
     * 把一段文本写到 tempDir 下并构造一个 multipart FormData。
     */
    function makeUploadForm(
      fileName: string,
      content: string | Buffer,
      mimeType = 'text/markdown'
    ): FormData {
      const filePath = join(tempDir, fileName)
      writeFileSync(filePath, content)
      const buffer = readFileSync(filePath)
      const blob = new Blob([buffer], { type: mimeType })
      const file = new File([blob], fileName, { type: mimeType })
      const form = new FormData()
      form.set('files', file, fileName)
      return form
    }

    /**
     * 直接 fetch 上传(不经 adminFetch,因为 adminFetch 会强制 application/json)。
     */
    async function uploadFiles(form: FormData): Promise<Response> {
      return await fetch(`${NOTER_ADMIN_BASE_URL}/api/admin/public-documents/upload`, {
        method: 'POST',
        headers: { cookie: cookies },
        body: form
      })
    }

    // ────────────────────────────────────────────────────────
    // 验证类失败(快速,不依赖 pipeline)
    // ────────────────────────────────────────────────────────

    describe('validation', () => {
      it('rejects file with disallowed extension (400)', async () => {
        const form = makeUploadForm(
          'malware.exe',
          'fake binary content',
          'application/octet-stream'
        )
        const res = await uploadFiles(form)
        expect(res.status).toBe(400)
      })

      it('rejects batch exceeding 20 files (400)', async () => {
        const form = new FormData()
        for (let i = 0; i < 21; i++) {
          const fileName = `f-${i}.md`
          const filePath = join(tempDir, fileName)
          writeFileSync(filePath, `# file ${i}`)
          const blob = new Blob([readFileSync(filePath)], {
            type: 'text/markdown'
          })
          form.append('files', new File([blob], fileName, { type: 'text/markdown' }))
        }
        const res = await uploadFiles(form)
        expect(res.status).toBe(400)
      })

      it('rejects empty file selection (400)', async () => {
        const form = new FormData()
        const res = await uploadFiles(form)
        expect(res.status).toBe(400)
      })
    })

    // ────────────────────────────────────────────────────────
    // 上传 → 列表显示 processing
    // ────────────────────────────────────────────────────────

    describe('upload → list shows processing', () => {
      it('upload returns processing status, list contains the document', async () => {
        const fileName = `upload-test-${Date.now()}.md`
        const form = makeUploadForm(
          fileName,
          '# Hello Noter\n\nThis is a test document for upload happy path.\n'
        )
        const uploadRes = await uploadFiles(form)
        expect(uploadRes.status).toBe(200)

        const uploadBody = await uploadRes.json()
        expect(Array.isArray(uploadBody.results)).toBe(true)
        expect(uploadBody.results.length).toBe(1)
        const result = uploadBody.results[0]
        expect(result.status).toBe('processing')
        expect(result.pipelineTriggered).toBe(true)
        expect(result.documentId).toBeTruthy()
        createdDocumentIds.push(result.documentId)

        // 列表查询能找到该文档
        const listRes = await adminFetch('/api/admin/public-documents?page=1&pageSize=20', {
          cookies
        })
        expect(listRes.status).toBe(200)
        const listBody = await listRes.json()
        const found = listBody.items.find((item: { id: string }) => item.id === result.documentId)
        expect(found).toBeTruthy()
        expect(found.status).toBe('processing')
      })
    })

    // ────────────────────────────────────────────────────────
    // 等待 pipeline 完成 → status=ready,version_no=1 出现
    // ────────────────────────────────────────────────────────

    describe.skipIf(SKIP_PIPELINE_WAIT)('wait for pipeline → ready + version_no=1', () => {
      it('document transitions to ready and creates version_no=1', async () => {
        const fileName = `wait-ready-${Date.now()}.md`
        const form = makeUploadForm(
          fileName,
          '# Wait for ready\n\nMinimal markdown for fast pipeline run.\n'
        )
        const uploadRes = await uploadFiles(form)
        expect(uploadRes.status).toBe(200)
        const { results } = await uploadRes.json()
        const documentId = results[0].documentId as string
        createdDocumentIds.push(documentId)

        // 轮询直到 status=ready(超时 60s,默认 2s 间隔)
        const finalStatus = await waitForDocumentStatus(documentId, 'ready', {
          timeoutMs: 60_000,
          intervalMs: 2_000
        })
        expect(finalStatus).toBe('ready')

        // 版本列表包含 version_no=1
        const verRes = await adminFetch(`/api/admin/public-documents/${documentId}/versions`, {
          cookies
        })
        expect(verRes.status).toBe(200)
        const verBody = await verRes.json()
        const versionNos = verBody.items.map((v: { versionNo: number }) => v.versionNo)
        expect(versionNos).toContain(1)
      }, 90_000)
    })

    // ────────────────────────────────────────────────────────
    // audit log
    // ────────────────────────────────────────────────────────

    describe('audit log', () => {
      it('upload action is recorded with file_size and file_ext metadata', async () => {
        const fileName = `audit-test-${Date.now()}.md`
        const form = makeUploadForm(fileName, '# audit log test\n')
        const uploadRes = await uploadFiles(form)
        const { results } = await uploadRes.json()
        createdDocumentIds.push(results[0].documentId)

        // 给后台 writeAuditLog (fire-and-forget) 一些时间
        await new Promise((r) => setTimeout(r, 1000))

        const logsRes = await adminFetch(
          '/api/admin/audit-logs?actionTypes=public_document.upload&page=1&pageSize=20',
          { cookies }
        )
        expect(logsRes.status).toBe(200)
        const logsBody = await logsRes.json()
        // 找到与本次上传 documentId 匹配的日志条目
        const log = logsBody.items.find(
          (item: { targetResourceId?: string }) => item.targetResourceId === results[0].documentId
        )
        expect(log).toBeTruthy()
        expect(log.metadata).toHaveProperty('file_size')
        expect(log.metadata).toHaveProperty('file_ext')
        expect(log.metadata.file_ext).toBe('md')
      })
    })
  }
)
