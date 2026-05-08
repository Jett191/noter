'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@noter/ui/components/avatar'
import { Button } from '@noter/ui/components/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@noter/ui/components/alert-dialog'
import { Settings, LogOut, UserX } from 'lucide-react'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

export function UserPanel() {
  const router = useRouter()
  const { user, clearUser } = useUserStore()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  if (!user) return null

  const displayName = user.username || user.email
  const truncatedName = displayName.length > 20 ? `${displayName.slice(0, 20)}…` : displayName
  const fallbackChar = (displayName[0] ?? '?').toUpperCase()

  const handleLogout = async () => {
    try {
      await userApi.signout()
    } catch {
      // Even if the API call fails, clear local state and redirect
    }
    clearUser()
    router.push('/signin')
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null)
    setIsDeleting(true)
    try {
      await userApi.signout()
      clearUser()
      router.push('/signin')
    } catch {
      setDeleteError('注销失败，请稍后重试')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='space-y-3'>
      {/* 用户信息 */}
      <div className='flex items-center gap-2'>
        <Avatar size='default'>
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
          <AvatarFallback>{fallbackChar}</AvatarFallback>
        </Avatar>
        <span className='truncate text-sm font-medium' title={displayName}>
          {truncatedName}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className='flex flex-col gap-1'>
        {/* 设置 */}
        <Button
          variant='ghost'
          size='sm'
          className='h-8 justify-start px-2 text-xs'
          onClick={() => router.push('/settings')}>
          <Settings className='mr-2 h-4 w-4' />
          设置
        </Button>

        {/* 登出 */}
        <Button
          variant='ghost'
          size='sm'
          className='h-8 justify-start px-2 text-xs'
          onClick={handleLogout}>
          <LogOut className='mr-2 h-4 w-4' />
          登出
        </Button>

        {/* 注销账号 */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className='text-destructive hover:text-destructive h-8 justify-start px-2 text-xs'>
              <UserX className='mr-2 h-4 w-4' />
              注销账号
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认注销账号</AlertDialogTitle>
              <AlertDialogDescription>
                此操作不可恢复，所有数据将被永久删除。确定要注销账号吗？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={handleDeleteAccount}
                disabled={isDeleting}>
                {isDeleting ? '处理中...' : '确认注销'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 错误提示 */}
        {deleteError && <p className='text-destructive px-2 text-xs'>{deleteError}</p>}
      </div>
    </div>
  )
}
