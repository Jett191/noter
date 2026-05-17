/**
 * Playwright config · noter-admin
 *
 * E2E specs live in `tests/e2e/*.spec.ts`. Run with:
 *
 *   pnpm exec playwright test
 *
 * Vitest is configured to ignore `tests/e2e/**`,所以这两个测试体系不会互相干扰。
 *
 * 必需环境变量(详见 tests/README.md):
 *   NOTER_ADMIN_BASE_URL                 默认 http://localhost:3001
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD 一个已存在的管理员账号(role=admin)
 *   E2E_USER_EMAIL  / E2E_USER_PASSWORD  一个 role=user 的账号(用于反向验证)
 *
 * Playwright 未在 package.json 中声明,运行前请先安装:
 *
 *   pnpm add -D @playwright/test
 *   pnpm exec playwright install chromium
 */

// 当 @playwright/test 未安装时,defineConfig 不存在,本配置仍可作为骨架文件存在
// 而不影响 vitest 测试运行(因为 vitest.config.ts 的 include 不包含 .ts 配置文件)。
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.NOTER_ADMIN_BASE_URL ?? 'http://localhost:3001'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // 单 worker:登录态/限流测试需要可重现顺序
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
