'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'
import { Button } from '@noter/ui/components/button'
import { Spinner } from '@noter/ui/components/spinner'
import { LogOut } from 'lucide-react'

function UserHomePage() {
  const user = useUserStore((s) => s.user)
  const clearUser = useUserStore((s) => s.clearUser)
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  // 退出登录
  async function handleSignout() {
    try {
      setSigningOut(true)
      await userApi.signout()
      clearUser()
      router.replace('/signin')
    } catch (error) {
      console.error(error)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className='p-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>
          {user?.username ? `Welcome, ${user.username}` : 'HomePage'}
        </h1>
        <Button variant='outline' size='sm' disabled={signingOut} onClick={handleSignout}>
          {signingOut ? <Spinner data-icon='inline-start' /> : <LogOut className='h-4 w-4' />}
          Sign out
        </Button>
      </div>
    </div>
  )
}

export default UserHomePage
