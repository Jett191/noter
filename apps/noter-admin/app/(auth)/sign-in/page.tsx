'use client'

/**
 * 管理员登录页
 *
 * 设计参见 design.md §7.1 (管理员登录) 与 §8.1:
 *   - email + password 表单,无注册/OAuth/忘记密码链接
 *   - 调用 POST /api/admin/auth/sign-in
 *   - 成功后写入 useAuthStore 并跳转 /dashboard
 *   - 错误时 Toast 提示
 *   - 429 时展示 IP 限流提示
 *   - URL 参数 reason=session_expired 时展示会话过期提示
 *
 * Requirements: 1, 2, 3
 */

import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{
    message: string
    type: 'error' | 'warning' | 'info'
  } | null>(null)

  const setAuth = useAuthStore((s) => s.setAuth)

  // 会话过期提示
  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setToast({ message: '会话已过期，请重新登录', type: 'warning' })
    }
  }, [searchParams])

  // 自动清除 toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setToast({ message: '请输入邮箱和密码', type: 'error' })
      return
    }

    setLoading(true)
    setToast(null)

    try {
      const res = await httpClient.post('/api/admin/auth/sign-in', { email, password })
      const { data } = res.data as { data: { email: string; role: 'admin' | 'super_admin' } }

      setAuth(data.email, data.role)
      router.push('/dashboard')
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response) {
        const { status, data } = err.response

        if (status === 429) {
          const retryAfter = err.response.headers?.['retry-after']
          const seconds = retryAfter ? parseInt(retryAfter, 10) : undefined
          const msg = seconds
            ? `登录请求过于频繁，请 ${seconds} 秒后再试`
            : '登录请求过于频繁，请稍后再试'
          setToast({ message: msg, type: 'warning' })
        } else if (status === 401) {
          setToast({ message: data?.message || '邮箱或密码错误', type: 'error' })
        } else if (status === 403) {
          setToast({ message: data?.message || '该账号无管理员权限', type: 'error' })
        } else {
          setToast({ message: data?.message || '登录失败，请重试', type: 'error' })
        }
      } else {
        setToast({ message: '网络异常，请检查连接后重试', type: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4'>
      <div className='w-full max-w-sm'>
        {/* Header */}
        <div className='mb-8 text-center'>
          <h1 className='text-2xl font-bold text-gray-900'>Noter Admin</h1>
          <p className='mt-2 text-sm text-gray-500'>管理员登录</p>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mb-4 rounded-md px-4 py-3 text-sm ${
              toast.type === 'error'
                ? 'border border-red-200 bg-red-50 text-red-700'
                : toast.type === 'warning'
                  ? 'border border-yellow-200 bg-yellow-50 text-yellow-700'
                  : 'border border-blue-200 bg-blue-50 text-blue-700'
            }`}
            role='alert'>
            {toast.message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label htmlFor='email' className='block text-sm font-medium text-gray-700'>
              邮箱
            </label>
            <input
              id='email'
              type='email'
              autoComplete='email'
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className='mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
              placeholder='admin@example.com'
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor='password' className='block text-sm font-medium text-gray-700'>
              密码
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
              placeholder='••••••••'
              disabled={loading}
            />
          </div>

          <button
            type='submit'
            disabled={loading}
            className='w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Type guard for axios errors
function isAxiosError(
  err: unknown
): err is {
  response: { status: number; data: Record<string, string>; headers: Record<string, string> }
} {
  return typeof err === 'object' && err !== null && 'response' in err
}
