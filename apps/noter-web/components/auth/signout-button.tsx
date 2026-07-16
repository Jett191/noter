'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@noter/ui/components/button'
import { Spinner } from '@noter/ui/components/spinner'
import { userApi } from '@/lib/axios/auth'
import { useUserStore } from '@/stores/user'

export function SignoutButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const [loading, setLoading] = useState(false)
  const clearUser = useUserStore((s) => s.clearUser)
  const router = useRouter()

  async function handleSignout() {
    try {
      setLoading(true)
      await userApi.signout()
      clearUser()
      router.replace('/signin')
    } catch (error) {
      console.error('Sign out failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant='outline'
      onClick={handleSignout}
      disabled={loading}
      className={className}
      {...props}>
      退出登录
      {loading && <Spinner data-icon='inline-start' />}
    </Button>
  )
}
