'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Spinner } from '@noter/ui/components/spinner'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

function CallBackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setUser = useUserStore((s) => s.setUser)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const provider = searchParams.get('provider')

      // 处理邮箱验证回调（保留原有逻辑）
      const type = searchParams.get('type')
      const tokenHash = searchParams.get('token_hash')
      if (type && tokenHash) {
        router.replace(`/api/auth/confirmEmail?type=${type}&token_hash=${tokenHash}`)
        return
      }

      // 处理 GitHub OAuth 回调
      if (provider === 'github') {
        try {
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
          )

          // Supabase 会自动从 URL hash 中提取 token 并建立 session
          const { error } = await supabase.auth.getSession()
          if (error) {
            setErrorMsg(error.message)
            return
          }

          // 获取用户信息并存入 store
          const user = await userApi.getProfile()
          setUser(user)
          router.replace('/home')
        } catch {
          setErrorMsg('GitHub 登录失败，请重试')
        }
        return
      }

      // 未知回调类型
      setErrorMsg('无效的回调参数')
    }

    handleCallback()
  }, [searchParams, router, setUser])

  if (errorMsg) {
    return (
      <div className='flex min-h-svh flex-col items-center justify-center gap-4'>
        <p className='text-destructive text-sm'>{errorMsg}</p>
        <a href='/signin' className='text-sm underline underline-offset-4'>
          返回登录页
        </a>
      </div>
    )
  }

  return (
    <div className='flex min-h-svh items-center justify-center gap-2'>
      <Spinner />
      <span className='text-muted-foreground text-sm'>正在处理中...</span>
    </div>
  )
}

export default CallBackPage
