/**
 * Next.js Middleware for noter-admin
 *
 * 设计参见 design.md §Architecture (鉴权链):
 *   - 每次请求刷新 cookie session（@supabase/ssr 模式）
 *   - 非 sign-in 路径若无有效 session 则重定向到 /sign-in
 *   - /sign-in 页面与 /api/admin/auth/sign-in 无需 session 即可访问
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 允许未登录访问的路径前缀列表。
 * 包含登录页本身和登录 API 端点。
 */
const PUBLIC_PATHS = ['/sign-in', '/api/admin/auth/sign-in']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  // 创建一个可修改的 response，后续 setAll 会将刷新后的 cookie 写入
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1. 写入 request cookies（供后续 Server Component 读取）
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // 2. 重新创建 response 以携带更新后的 request headers
          supabaseResponse = NextResponse.next({ request })
          // 3. 写入 response cookies（返回给浏览器）
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        }
      }
    }
  )

  // 刷新 session（重要：不要用 getSession，必须用 getUser 来验证 JWT）
  const {
    data: { user }
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 非公开路径且无有效 session → 重定向到 /sign-in
  if (!user && !isPublicPath(pathname)) {
    const signInUrl = request.nextUrl.clone()
    signInUrl.pathname = '/sign-in'
    return NextResponse.redirect(signInUrl)
  }

  return supabaseResponse
}

/**
 * Matcher 配置：排除静态资源、_next 内部路径、favicon 等。
 * 仅对业务路由执行 middleware。
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}
