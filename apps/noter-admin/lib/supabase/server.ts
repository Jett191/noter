/**
 * Supabase SSR cookie-session client for noter-admin Route Handlers / Server Components.
 *
 * 设计参见 design.md §3 与 §Project Structure：
 *   - 使用 @supabase/ssr 的 createServerClient,基于 Next.js 16 异步 `cookies()` 维护 cookie session
 *   - 仅持有 anon key,跨用户特权读写另由 lib/supabase/admin.ts (service_role) 完成
 *   - cookies.setAll 在 React Server Component 中调用会抛错,需 try/catch 兼容
 *     (Server Component 渲染期间无法写 cookie;此时由 middleware 负责刷新 session)
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function readEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `[noter-admin] Missing required environment variable: ${name}. ` +
        `请在 apps/noter-admin/.env.local 中配置该变量。`
    )
  }
  return value
}

export async function createSupabaseServerClient() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // 在 Server Component 渲染期间调用 cookieStore.set 会抛错。
          // 此处吞掉异常,session 刷新交由 middleware.ts 负责。
        }
      }
    }
  })
}
