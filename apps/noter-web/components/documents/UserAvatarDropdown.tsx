'use client'

import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@noter/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@noter/ui/components/dropdown-menu'
import { LogOut, Settings } from 'lucide-react'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

export function UserAvatarDropdown() {
  const router = useRouter()
  const { user, clearUser } = useUserStore()

  if (!user) return null

  const displayName = user.username || user.email
  const fallbackChar = (displayName[0] ?? '?').toUpperCase()

  const handleLogout = async () => {
    try {
      await userApi.signout()
    } catch {
      // Clear local state regardless
    }
    clearUser()
    router.push('/signin')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className='cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring'>
        <Avatar className='size-9'>
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
          <AvatarFallback>{fallbackChar}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel className='flex flex-col gap-1'>
          <span className='truncate text-sm font-medium'>{user.username}</span>
          <span className='truncate text-xs font-normal text-muted-foreground'>
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push('/profile')}>
            <Settings data-icon='inline-start' />
            编辑资料
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut data-icon='inline-start' />
            登出
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
