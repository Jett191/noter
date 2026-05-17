/**
 * Task 16.10 · E2E:公共文档上传到列表 (Playwright)
 *
 * 设计参见 design.md §7.2 / §8.1 / §8.3。
 *
 * 流程:
 *   1. 登录 → /public-documents
 *   2. 点击「上传文档」按钮 → 打开 UploadDialog
 *   3. 选择一份小型 markdown 文件
 *   4. 点击对话框中的「上传」按钮
 *   5. 列表中出现新文档,状态徽章显示「处理中」(processing)
 *   6. 等待状态变为「就绪」(ready) — 受 pipeline 真实执行时长影响,默认 60s 超时
 *
 * 运行前提(详见 tests/README.md):
 *   - noter-admin 开发服务器运行中(pnpm --filter noter-admin dev)
 *   - Supabase 本地实例 + 已 seed 系统账号 / 系统文件夹
 *   - 已部署 parse-document Edge Function 到本地 supabase
 *   - 已创建一个管理员账号(role=admin 或 super_admin)
 *   - 必需 env:
 *       NOTER_ADMIN_BASE_URL
 *       E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *
 * 运行命令:
 *   pnpm exec playwright test tests/e2e/public-document-upload.spec.ts
 */

import { test, expect } from '@playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

const E2E_ADMIN_AVAILABLE = Boolean(ADMIN_EMAIL) && Boolean(ADMIN_PASSWORD)

// 是否等待 ready (依赖外部 pipeline / LLM,可能耗时);默认开启,
// 设置 SKIP_PIPELINE_WAIT=1 可仅验证「上传后列表显示 processing」即结束。
const SKIP_PIPELINE_WAIT = process.env.SKIP_PIPELINE_WAIT === '1'

test.describe('E2E · Public Document Upload → List', () => {
  test.skip(
    !E2E_ADMIN_AVAILABLE,
    'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run this suite (see tests/README.md).'
  )

  test('upload a markdown file and see it in the list with processing → ready', async ({
    page
  }) => {
    test.setTimeout(120_000)

    // ─── 0. 准备一份小型 markdown 文件 ───
    const tempDir = mkdtempSync(join(tmpdir(), 'noter-e2e-upload-'))
    const fileName = `e2e-upload-${Date.now()}.md`
    const filePath = join(tempDir, fileName)
    writeFileSync(filePath, '# Hello Noter\n\nThis is a tiny markdown file uploaded by E2E test.\n')

    // ─── 1. 登录 ───
    await page.goto('/sign-in')
    await page.locator('#email').fill(ADMIN_EMAIL)
    await page.locator('#password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })

    // ─── 2. 进入公共文档页 ───
    await page.goto('/public-documents')
    await expect(page).toHaveURL(/\/public-documents/)

    // ─── 3. 打开上传对话框 ───
    await page.getByRole('button', { name: '上传文档' }).click()
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible()

    // ─── 4. 选择文件 (隐藏 input)───
    // UploadDialog 中 <input type="file" multiple className="hidden" />,
    // 通过 setInputFiles 直接注入即可,无需触发 click 弹出系统对话框
    const fileInput = page.locator('input[type="file"][multiple]')
    await fileInput.setInputFiles(filePath)

    // 文件应出现在文件列表中,带「待上传」徽章
    await expect(page.getByText(fileName)).toBeVisible()

    // ─── 5. 点击对话框中的「上传 (1)」按钮 ───
    await page.getByRole('button', { name: /上传 \(1\)/ }).click()

    // ─── 6. 上传完成后列表自动刷新,新文档出现 ───
    // UploadDialog 在 onSuccess 中触发 toast「上传完成」并重新拉取列表
    await expect(page.locator('text=上传完成')).toBeVisible({ timeout: 30_000 })

    // 列表中应出现该文档(以文件名为锚点),状态徽章为「处理中」
    const docTitle = fileName.replace(/\.[^.]+$/, '')
    const docRow = page.locator('tr', { hasText: docTitle })
    await expect(docRow).toBeVisible({ timeout: 10_000 })
    await expect(docRow).toContainText(/处理中|就绪/)

    // ─── 7. 等待状态变为「就绪」(可选,SKIP_PIPELINE_WAIT=1 时跳过)───
    if (!SKIP_PIPELINE_WAIT) {
      await expect(async () => {
        await page.reload()
        const row = page.locator('tr', { hasText: docTitle })
        await expect(row).toContainText('就绪')
      }).toPass({ timeout: 90_000, intervals: [2_000, 4_000, 6_000] })
    }
  })
})
