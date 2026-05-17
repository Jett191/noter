#!/usr/bin/env tsx
/**
 * Admin Platform Seed Script · Task 1.10
 *
 * 幂等地建立 noter-admin 平台运行所需的初始数据：
 *
 *   1. 系统账号(profiles.is_system_account=true)
 *      - Auth 侧:supabase.auth.admin.createUser({ email, password, email_confirm: true })
 *      - profiles 侧:由现有 trigger `on_auth_user_created` -> `public.handle_new_user()` 自动插入,
 *        seed 只需把 is_system_account 设为 true。如果 trigger 因故未触发(例如 auth 行先于
 *        trigger 创建),seed 会兜底手动 INSERT 一行 profiles。
 *      - 若 profiles 中已存在 is_system_account=true 的行 -> 跳过创建并复用其 id。
 *
 *   2. 系统文件夹 "Noter 官方" (folders.is_system_folder=true)
 *      - 仅在 (is_system_folder=true AND name='Noter 官方' AND deleted=0) 不存在时插入,
 *        owner = 系统账号 id,parent_id = NULL。
 *
 *   3. 超级管理员 (profiles.role='super_admin')
 *      - NOTER_SUPER_ADMIN_EMAIL 留空 -> 跳过。
 *      - 命中后:拒绝把系统账号提升为 super_admin;若已是 super_admin 则跳过;
 *        partial unique index `profiles_super_admin_uniq` (task 1.1) 冲突时,
 *        优雅地打印错误并退出 0(不抛异常),让运维知晓需要先降级现有 super_admin。
 *
 * 必需环境变量:
 *   NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 可选环境变量:
 *   NOTER_SYSTEM_ACCOUNT_EMAIL     默认 'system@noter.local'
 *   NOTER_SYSTEM_ACCOUNT_PASSWORD  默认随机 32 字节 base64url 强密码(系统账号无需登录)
 *   NOTER_SUPER_ADMIN_EMAIL        留空则不进行 super_admin 提升
 *
 * 运行方式:
 *   pnpm --filter noter-admin seed:admin
 *
 * 安全:
 *   - 仅服务端使用 service_role key,绕过 RLS。该脚本通过 process.env 读密钥,不会被打入浏览器 bundle。
 *   - 不在日志里打印任何密码或 service_role 值。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

// 优先加载 .env.local,再加载 .env;均不覆盖已在 process.env 中存在的值。
loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

const DEFAULT_SYSTEM_EMAIL = 'system@noter.local'
const SYSTEM_FOLDER_NAME = 'Noter 官方'

interface ProfileRow {
  id: string
  email: string | null
  role: string | null
  is_system_account: boolean
  deleted: number | null
}

function getRequiredEnv(name: string): string {
  const v = process.env[name]
  if (v && v.length > 0) return v
  throw new Error(`[seed-admin] required env ${name} is not set`)
}

function generateStrongPassword(): string {
  // 32 字节随机数 base64url 化得到 ~43 字符无需转义的强密码。
  return randomBytes(32).toString('base64url')
}

function buildClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!url) {
    throw new Error('[seed-admin] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL must be set')
  }
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

async function findExistingSystemProfile(supabase: SupabaseClient): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_system_account, deleted')
    .eq('is_system_account', true)
    .eq('deleted', 0)
    .limit(1)
    .maybeSingle<ProfileRow>()
  if (error) {
    throw new Error(`[seed-admin] query system profile failed: ${error.message}`)
  }
  return data ?? null
}

async function findProfileByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_system_account, deleted')
    .eq('email', email)
    .limit(1)
    .maybeSingle<ProfileRow>()
  if (error) {
    throw new Error(`[seed-admin] query profile by email failed: ${error.message}`)
  }
  return data ?? null
}

/**
 * 创建/复用系统账号并返回其 profile id。
 *
 * 流程:
 *   1. 优先查找已存在的 is_system_account=true 行 -> 复用。
 *   2. 否则按 email 查 profiles:
 *        a. 命中 -> 复用其 id;
 *        b. 否则调用 supabase.auth.admin.createUser 创建 Auth 用户,
 *           触发 handle_new_user trigger 自动插入 profiles 行;若 trigger 未生效,
 *           兜底手动 INSERT(用同一个 uuid)。
 *   3. UPDATE profiles SET is_system_account = true。
 */
async function ensureSystemAccount(supabase: SupabaseClient): Promise<string> {
  const existing = await findExistingSystemProfile(supabase)
  if (existing) {
    console.log(
      `[seed-admin] system account already exists (id=${existing.id}, email=${existing.email}); skip create.`
    )
    return existing.id
  }

  const systemEmail = process.env.NOTER_SYSTEM_ACCOUNT_EMAIL?.trim() || DEFAULT_SYSTEM_EMAIL
  const systemPassword = process.env.NOTER_SYSTEM_ACCOUNT_PASSWORD || generateStrongPassword()

  // 同邮箱 profile 已存在(可能是历史遗留,但 is_system_account=false)-> 直接复用并标记。
  const sameEmailProfile = await findProfileByEmail(supabase, systemEmail)
  if (sameEmailProfile) {
    console.log(
      `[seed-admin] profile with email=${systemEmail} already exists (id=${sameEmailProfile.id}); will mark is_system_account=true.`
    )
    await markProfileAsSystem(supabase, sameEmailProfile.id)
    return sameEmailProfile.id
  }

  console.log(`[seed-admin] creating Auth user for system account email=${systemEmail} ...`)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: systemEmail,
    password: systemPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Noter System', user_name: 'noter-system' },
    app_metadata: { provider: 'system' }
  })
  if (createErr || !created.user) {
    throw new Error(
      `[seed-admin] supabase.auth.admin.createUser failed: ${createErr?.message ?? 'unknown error'}`
    )
  }
  const newUserId = created.user.id

  // handle_new_user trigger 应已自动插入 profiles 行;兜底:若没有则手动 INSERT。
  const insertedProfile = await findProfileByEmail(supabase, systemEmail)
  if (!insertedProfile) {
    console.log('[seed-admin] handle_new_user trigger did not insert profile; inserting manually.')
    const { error: insertErr } = await supabase.from('profiles').insert({
      id: newUserId,
      email: systemEmail,
      username: 'noter-system',
      nike_name: 'Noter System',
      role: 'user',
      provider: 'system',
      deleted: 0,
      not_active: 0
    })
    if (insertErr) {
      throw new Error(`[seed-admin] manual profile insert failed: ${insertErr.message}`)
    }
  }

  await markProfileAsSystem(supabase, newUserId)
  console.log(`[seed-admin] system account created (id=${newUserId}, email=${systemEmail}).`)
  return newUserId
}

async function markProfileAsSystem(supabase: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_system_account: true })
    .eq('id', profileId)
  if (error) {
    throw new Error(
      `[seed-admin] update profiles.is_system_account=true failed (id=${profileId}): ${error.message}`
    )
  }
}

/**
 * 创建/复用 "Noter 官方" 系统文件夹,owner = 系统账号 id,parent_id = NULL。
 * 仅在 (is_system_folder=true AND name='Noter 官方' AND deleted=0) 不存在时插入。
 */
async function ensureSystemFolder(
  supabase: SupabaseClient,
  systemAccountId: string
): Promise<string> {
  const { data: existing, error: queryErr } = await supabase
    .from('folders')
    .select('id')
    .eq('is_system_folder', true)
    .eq('name', SYSTEM_FOLDER_NAME)
    .eq('deleted', 0)
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (queryErr) {
    throw new Error(`[seed-admin] query system folder failed: ${queryErr.message}`)
  }
  if (existing) {
    console.log(`[seed-admin] system folder already exists (id=${existing.id}); skip create.`)
    return existing.id
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('folders')
    .insert({
      user_id: systemAccountId,
      name: SYSTEM_FOLDER_NAME,
      parent_id: null,
      is_system_folder: true,
      deleted: 0
    })
    .select('id')
    .single<{ id: string }>()
  if (insertErr || !inserted) {
    throw new Error(
      `[seed-admin] insert system folder failed: ${insertErr?.message ?? 'unknown error'}`
    )
  }
  console.log(
    `[seed-admin] system folder created (id=${inserted.id}, name="${SYSTEM_FOLDER_NAME}").`
  )
  return inserted.id
}

/**
 * 把 NOTER_SUPER_ADMIN_EMAIL 指定的用户提升为 super_admin。
 * 拒绝把系统账号提升为 super_admin;若已是 super_admin 则跳过;
 * partial unique index 冲突(已存在另一位 super_admin)时优雅退出 0。
 */
async function ensureSuperAdmin(supabase: SupabaseClient): Promise<void> {
  const targetEmail = process.env.NOTER_SUPER_ADMIN_EMAIL?.trim()
  if (!targetEmail) {
    console.log('[seed-admin] NOTER_SUPER_ADMIN_EMAIL not set; skip super_admin promotion.')
    return
  }

  const profile = await findProfileByEmail(supabase, targetEmail)
  if (!profile) {
    console.warn(
      `[seed-admin] profile for NOTER_SUPER_ADMIN_EMAIL=${targetEmail} not found; user must sign up first. Skipping promotion.`
    )
    return
  }
  if (profile.is_system_account) {
    console.warn(
      `[seed-admin] refuse to promote system account (id=${profile.id}, email=${targetEmail}) to super_admin.`
    )
    return
  }
  if (profile.role === 'super_admin' && profile.deleted === 0) {
    console.log(`[seed-admin] profile (email=${targetEmail}) is already super_admin; skip update.`)
    return
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', profile.id)
  if (error) {
    // partial unique index `profiles_super_admin_uniq` 冲突 (Postgres 23505)
    // 任意已存在的未删除 super_admin 会触发此冲突。
    const code = (error as { code?: string }).code
    if (code === '23505') {
      console.error(
        `[seed-admin] unique violation: another active super_admin already exists; cannot promote ${targetEmail}. ` +
          'Demote the existing super_admin first, then re-run this seed.'
      )
      return
    }
    throw new Error(
      `[seed-admin] promote super_admin failed (email=${targetEmail}): ${error.message} (code=${code ?? 'n/a'})`
    )
  }
  console.log(`[seed-admin] promoted profile (email=${targetEmail}) to super_admin.`)
}

async function main(): Promise<void> {
  console.log('[seed-admin] starting Noter admin platform seed...')
  const supabase = buildClient()
  const systemAccountId = await ensureSystemAccount(supabase)
  await ensureSystemFolder(supabase, systemAccountId)
  await ensureSuperAdmin(supabase)
  console.log('[seed-admin] done. Seed script finished successfully.')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[seed-admin] FAILED: ${msg}`)
  process.exitCode = 1
})
