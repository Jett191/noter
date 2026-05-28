/**
 * Supabase service-role 客户端单例（仅在 Next.js Route Handler / Server 端使用）。
 *
 * 用途：访问启用了「仅 service_role 可读写」RLS 的表（例如 agent_skill_sessions）。
 * 普通用户鉴权仍走 `lib/supabase/server.ts`（@supabase/ssr cookie session），
 * 这两个 client 必须严格分离，避免把 service_role key 暴露到浏览器侧。
 *
 * 注意：本文件**仅**可在 Next.js server 端代码（Route Handler / Server Component / Server Action）中 import。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('[supabase/admin] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL 未配置')
  }
  if (!key) {
    throw new Error(
      '[supabase/admin] SUPABASE_SERVICE_ROLE_KEY 未配置；service-role 客户端无法初始化'
    )
  }

  cachedClient = createClient(url, key, {
    auth: {
      // service_role 不需要持久化会话
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })

  return cachedClient
}
