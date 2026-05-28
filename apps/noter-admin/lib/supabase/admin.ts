import 'server-only'

/**
 * Supabase service_role 客户端单例(仅服务端可用)。
 *
 * 设计参见 design.md §3 (Architecture / Security):
 *   - 所有 /api/admin/* Route Handler 通过此客户端绕过 RLS 执行跨用户读写
 *   - service_role key 仅注入 noter-admin 进程,通过文件首行 `import 'server-only'`
 *     防止被任何客户端 bundle 意外引入(被 webpack 静态分析直接拒绝)
 *   - 同时支持 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_URL,与 seed 脚本保持一致
 *   - 关闭 session 持久化:service_role 不应持有会话状态
 *
 * 调用方式:
 *   import { getSupabaseAdmin } from '@/lib/supabase/admin'
 *   const supabase = getSupabaseAdmin()
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error(
      '[noter-admin] Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL). ' +
        '请在 apps/noter-admin/.env.local 中配置该变量。'
    )
  }
  if (!serviceRoleKey) {
    throw new Error(
      '[noter-admin] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY. ' +
        'service_role 客户端无法初始化。请在 apps/noter-admin/.env.local 中配置该变量,' +
        '且严禁加 NEXT_PUBLIC_ 前缀,以免泄露到浏览器 bundle。'
    )
  }

  _client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })

  return _client
}
