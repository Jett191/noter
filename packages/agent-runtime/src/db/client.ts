/**
 * supabase-js service-role 单例。
 *
 * agent-runtime 在 noter-web Next.js 进程内运行，**只**用 service_role 绕过 RLS：
 *   - `agent_skill_sessions` 表对 authenticated/anon 已 REVOKE，必须 service_role 访问；
 *   - `documents` / `document_contents` / `document_chunks` / `document_summaries` 等
 *     由各 Tool 在 SQL 层强制 `user_id = :userId AND document_id = :documentId AND deleted = 0` 谓词，
 *     不依赖 RLS 隔离；
 *   - `hybrid_search_scoped` RPC 仅授予 service_role EXECUTE。
 *
 * Route Handler 自己的鉴权用 `apps/noter-web/lib/supabase/server.ts`（@supabase/ssr cookie session），
 * **不**复用本单例，避免把 service_role key 暴露到浏览器侧。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('[agent-runtime] SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL 未配置')
  }
  if (!key) {
    throw new Error(
      '[agent-runtime] SUPABASE_SERVICE_ROLE_KEY 未配置；agent-runtime 必须用 service_role'
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

/** 仅供测试使用：重置缓存的 client（例如换 env 时） */
export function __resetSupabaseServiceClientForTest(): void {
  cachedClient = null
}
