#!/usr/bin/env tsx
/**
 * 一次性脚本：创建一个测试用 super_admin 账号
 *
 * 用法：
 *   pnpm --filter noter-admin tsx scripts/create-test-admin.ts \
 *     [email] [password]
 *
 * 默认值：
 *   email    = admin@noter.test
 *   password = Admin@123456
 *
 * 行为：
 *   1. 通过 service_role 调用 supabase.auth.admin.createUser 创建已邮箱确认的 Auth 用户
 *      （若该邮箱已存在 Auth 用户，则复用）。
 *   2. handle_new_user trigger 会自动插入 profiles 行；若未插入则手动 INSERT。
 *   3. 将该 profile 的 role 更新为 super_admin。
 *      - 若库内已存在另一位 active super_admin，由于 partial unique index
 *        profiles_super_admin_uniq，会改为提升为 admin（管理员系统同样接受 admin 角色）。
 *
 * 不会修改：
 *   - 任何其它已存在的用户
 *   - 已有的 super_admin
 *   - 任何业务数据
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

const DEFAULT_EMAIL = 'admin@noter.test'
const DEFAULT_PASSWORD = 'Admin@123456'

function buildClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL must be set')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

async function findUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  // listUsers 不能按 email 过滤，但 admin.getUserByEmail 在新版 SDK 是 listUsers + filter；
  // 这里用 profiles 反查更直接（profile.id == auth.users.id）
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`query profile by email failed: ${error.message}`)
  return data?.id ?? null
}

async function ensureAuthUser(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<string> {
  const existing = await findUserIdByEmail(supabase, email)
  if (existing) {
    console.log(`[create-test-admin] reuse existing user (id=${existing}, email=${email})`)
    return existing
  }
  console.log(`[create-test-admin] creating Auth user email=${email} ...`)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Noter Test Admin', user_name: 'noter-test-admin' }
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? 'unknown error'}`)
  }
  return data.user.id
}

async function ensureProfileRow(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`query profile by id failed: ${error.message}`)
  if (data) return
  console.log(`[create-test-admin] handle_new_user trigger missed; inserting profile manually.`)
  const { error: insertErr } = await supabase.from('profiles').insert({
    id: userId,
    email,
    username: 'noter-test-admin',
    nike_name: 'Noter Test Admin',
    role: 'user',
    provider: 'email',
    deleted: 0,
    not_active: 0
  })
  if (insertErr) throw new Error(`manual profile insert failed: ${insertErr.message}`)
}

async function promote(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<'super_admin' | 'admin'> {
  // 检查现有角色 / deleted / not_active
  const { data: existing, error: queryErr } = await supabase
    .from('profiles')
    .select('role, deleted, not_active')
    .eq('id', userId)
    .single<{ role: string; deleted: number; not_active: number }>()
  if (queryErr || !existing) {
    throw new Error(`query profile role failed: ${queryErr?.message ?? 'not found'}`)
  }
  if (existing.deleted !== 0 || existing.not_active !== 0) {
    // 兜底恢复账号到可登录状态
    await supabase.from('profiles').update({ deleted: 0, not_active: 0 }).eq('id', userId)
  }
  if (existing.role === 'super_admin' || existing.role === 'admin') {
    console.log(
      `[create-test-admin] profile (email=${email}) is already ${existing.role}; skip update.`
    )
    return existing.role as 'super_admin' | 'admin'
  }

  // 先尝试 super_admin
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', userId)
  if (!upErr) {
    console.log(`[create-test-admin] promoted ${email} to super_admin.`)
    return 'super_admin'
  }
  const code = (upErr as { code?: string }).code
  if (code !== '23505') {
    throw new Error(`promote super_admin failed: ${upErr.message} (code=${code})`)
  }
  // 已存在另一位 active super_admin → 退化为 admin
  console.warn(
    `[create-test-admin] another active super_admin exists; promoting ${email} to admin instead.`
  )
  const { error: upErr2 } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId)
  if (upErr2) {
    throw new Error(`promote admin failed: ${upErr2.message}`)
  }
  console.log(`[create-test-admin] promoted ${email} to admin.`)
  return 'admin'
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim() || DEFAULT_EMAIL
  const password = process.argv[3] || DEFAULT_PASSWORD

  console.log(`[create-test-admin] target email=${email}`)
  const supabase = buildClient()
  const userId = await ensureAuthUser(supabase, email, password)
  await ensureProfileRow(supabase, userId, email)
  const role = await promote(supabase, userId, email)

  console.log('')
  console.log('===== Test admin ready =====')
  console.log(`  email:    ${email}`)
  console.log(`  password: ${password}`)
  console.log(`  role:     ${role}`)
  console.log(`  user_id:  ${userId}`)
  console.log('============================')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[create-test-admin] FAILED: ${msg}`)
  process.exitCode = 1
})
