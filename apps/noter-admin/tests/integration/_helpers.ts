/**
 * Shared helpers for noter-admin integration tests.
 *
 * 这些 helper 假设宿主机上有一个**真实**的 Supabase 实例(例如 `supabase start` 启动的本地容器),
 * 且已应用所有 migration(包括 RLS 策略)与 seed 脚本(系统账号 + 系统文件夹 + super_admin)。
 *
 * 必需环境变量(由 .env.test.local 或 CI 注入):
 *   SUPABASE_TEST_URL                  Supabase REST URL (e.g. http://127.0.0.1:54321)
 *   SUPABASE_TEST_SERVICE_ROLE_KEY     service_role key (跨 RLS,用于 setup/teardown)
 *   SUPABASE_TEST_ANON_KEY             anon key (用于 RLS 测试)
 *   NOTER_ADMIN_BASE_URL               Route Handler 的基地址 (e.g. http://localhost:3001)
 *
 * 可选:
 *   SUPABASE_TEST_DB_URL               直连 Postgres URL,用于通过 SQL 直接清理测试数据
 *
 * 设计参考 design.md §Testing Strategy。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID, randomBytes } from 'node:crypto'

// ─── 环境检测 ───

/**
 * 判定当前环境是否具备运行集成测试的最小条件。
 * Vitest 的 `describe.skipIf(!INTEGRATION_TESTS_ENABLED)` 据此自动跳过整组测试。
 */
export const INTEGRATION_TESTS_ENABLED =
  Boolean(process.env.SUPABASE_TEST_URL) &&
  Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY) &&
  Boolean(process.env.NOTER_ADMIN_BASE_URL)

export const SUPABASE_TEST_URL = process.env.SUPABASE_TEST_URL ?? ''
export const SUPABASE_TEST_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''
export const SUPABASE_TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? ''
export const NOTER_ADMIN_BASE_URL = process.env.NOTER_ADMIN_BASE_URL ?? 'http://localhost:3001'

// ─── Supabase 客户端工厂 ───

let _serviceClient: SupabaseClient | null = null

/**
 * 返回一个 service_role 客户端,用于绕过 RLS 进行 setup / teardown。
 * 仅在 INTEGRATION_TESTS_ENABLED=true 时调用。
 */
export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient
  _serviceClient = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
  return _serviceClient
}

/**
 * 用 anon key 创建客户端,可选携带一个已登录用户的 access token 以模拟 noter-web。
 */
export function getAnonClient(accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: accessToken
      ? {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      : undefined
  })
}

// ─── 测试用户工厂 ───

export interface TestUserHandle {
  /** profiles.id (== auth.users.id) */
  id: string
  email: string
  password: string
  role: 'user' | 'admin' | 'super_admin'
  /** 由 signInWithPassword 返回的 access token,用于 anon-session RLS 测试 */
  accessToken?: string
}

/**
 * 为一次测试创建一个独立的用户。
 * 使用唯一邮箱前缀 `test-<uuid>@noter.test` 避免污染。
 *
 * - 调用 supabase.auth.admin.createUser(email_confirm=true)
 * - profiles 行由 handle_new_user trigger 自动插入
 * - 通过 service client 设置 role,避免 super_admin 唯一性约束影响
 */
export async function createTestUser(opts: {
  role: 'user' | 'admin' | 'super_admin'
  emailPrefix?: string
}): Promise<TestUserHandle> {
  const supabase = getServiceClient()
  const email = `${opts.emailPrefix ?? 'test'}-${randomUUID()}@noter.test`
  const password = randomBytes(24).toString('base64url')

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (createErr || !created.user) {
    throw new Error(`createTestUser: auth.admin.createUser failed: ${createErr?.message}`)
  }

  // handle_new_user trigger 应自动插入 profiles 行;补丁式更新 role
  if (opts.role !== 'user') {
    const { error: roleErr } = await supabase
      .from('profiles')
      .update({ role: opts.role })
      .eq('id', created.user.id)
    if (roleErr) {
      throw new Error(`createTestUser: set role failed: ${roleErr.message}`)
    }
  }

  return {
    id: created.user.id,
    email,
    password,
    role: opts.role
  }
}

/**
 * 删除测试用户(同时清理 auth.users + profiles cascade)。
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    // 软失败:不影响其他测试;teardown 出错只打印。
    console.warn(`[test] deleteTestUser failed for ${userId}: ${error.message}`)
  }
}

// ─── 登录辅助 ───

/**
 * 调用 sign-in 端点,返回该响应的 Set-Cookie 头(用于后续受保护请求)。
 * 失败时返回 null。
 */
export async function signInAsAdmin(
  email: string,
  password: string
): Promise<{ cookies: string; status: number } | null> {
  const res = await fetch(`${NOTER_ADMIN_BASE_URL}/api/admin/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  const setCookies = res.headers.get('set-cookie') ?? ''
  if (res.status !== 200) {
    return null
  }
  return { cookies: setCookies, status: res.status }
}

/**
 * 通用调用 /api/admin/* 接口的 helper,自动携带 cookies。
 */
export async function adminFetch(
  path: string,
  init: RequestInit & { cookies?: string } = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.cookies) headers.set('cookie', init.cookies)
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json')
  }
  return fetch(`${NOTER_ADMIN_BASE_URL}${path}`, {
    ...init,
    headers
  })
}

// ─── 文档 / 分类 / 标签 工厂 ───

export async function createTestPublicCategory(name?: string): Promise<{
  id: string
  name: string
}> {
  const supabase = getServiceClient()
  const finalName = name ?? `test-cat-${randomUUID().slice(0, 8)}`
  const { data, error } = await supabase
    .from('public_categories')
    .insert({ name: finalName, sort_order: 0, deleted: 0 })
    .select('id, name')
    .single()
  if (error || !data) {
    throw new Error(`createTestPublicCategory failed: ${error?.message}`)
  }
  return { id: data.id as string, name: data.name as string }
}

export async function createTestPublicTag(name?: string): Promise<{
  id: string
  name: string
}> {
  const supabase = getServiceClient()
  const finalName = name ?? `test-tag-${randomUUID().slice(0, 8)}`
  const { data, error } = await supabase
    .from('tags')
    .insert({ name: finalName, is_official: true, deleted: 0 })
    .select('id, name')
    .single()
  if (error || !data) {
    throw new Error(`createTestPublicTag failed: ${error?.message}`)
  }
  return { id: data.id as string, name: data.name as string }
}

/**
 * 直接通过 service client 创建一份"已 ready"的公共文档(绕过 pipeline)。
 * 适合不需要测试 pipeline 本身的场景(例如版本/编辑/RLS 测试)。
 */
export async function createTestPublicDocument(opts: {
  title?: string
  markdown?: string
  status?: 'ready' | 'processing' | 'failed'
}): Promise<{ id: string; title: string }> {
  const supabase = getServiceClient()

  const { data: systemProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_system_account', true)
    .limit(1)
    .single()
  const { data: systemFolder } = await supabase
    .from('folders')
    .select('id')
    .eq('is_system_folder', true)
    .limit(1)
    .single()
  if (!systemProfile || !systemFolder) {
    throw new Error('createTestPublicDocument: system profile / folder not seeded')
  }

  const title = opts.title ?? `test-doc-${randomUUID().slice(0, 8)}`
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      title,
      file_name: `${title}.md`,
      file_size: 1024,
      file_type: 'md',
      document_scope: 'public',
      user_id: systemProfile.id,
      folder_id: systemFolder.id,
      status: opts.status ?? 'ready',
      parse_status: 'completed'
    })
    .select('id, title')
    .single()
  if (docErr || !doc) {
    throw new Error(`createTestPublicDocument insert failed: ${docErr?.message}`)
  }

  // 写入 document_contents
  const { error: contentErr } = await supabase.from('document_contents').insert({
    document_id: doc.id,
    markdown_content: opts.markdown ?? '# initial content'
  })
  if (contentErr) {
    // 部分项目用 upsert,容错处理
    if (!/duplicate key/i.test(contentErr.message)) {
      throw new Error(`createTestPublicDocument content insert failed: ${contentErr.message}`)
    }
  }

  // 写入 version_no=1
  const { error: verErr } = await supabase.from('public_document_versions').insert({
    document_id: doc.id,
    version_no: 1,
    markdown_content: opts.markdown ?? '# initial content',
    editor_user_id: systemProfile.id
  })
  if (verErr && !/duplicate key/i.test(verErr.message)) {
    throw new Error(`createTestPublicDocument version insert failed: ${verErr.message}`)
  }

  return { id: doc.id as string, title: doc.title as string }
}

/**
 * 软删除测试公共文档及其关联数据。
 */
export async function cleanupTestPublicDocument(documentId: string): Promise<void> {
  const supabase = getServiceClient()
  // 物理删除版本与内容,然后删除 document
  await supabase.from('public_document_versions').delete().eq('document_id', documentId)
  await supabase.from('document_contents').delete().eq('document_id', documentId)
  await supabase.from('document_tags').delete().eq('document_id', documentId)
  await supabase.from('documents').delete().eq('id', documentId)
}

/**
 * 通过等待轮询读取 documents.status 直到符合期望或超时。
 */
export async function waitForDocumentStatus(
  documentId: string,
  expected: 'ready' | 'failed',
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<string> {
  const supabase = getServiceClient()
  const timeoutMs = opts.timeoutMs ?? 60_000
  const intervalMs = opts.intervalMs ?? 2_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.from('documents').select('status').eq('id', documentId).single()
    if (data?.status === expected) return data.status
    if (data?.status === 'failed' && expected !== 'failed') {
      return 'failed'
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`waitForDocumentStatus timed out after ${timeoutMs}ms`)
}
