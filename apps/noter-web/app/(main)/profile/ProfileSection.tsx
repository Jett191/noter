'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@noter/ui/components/avatar'
import { Button } from '@noter/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@noter/ui/components/card'
import { Input } from '@noter/ui/components/input'
import { Separator } from '@noter/ui/components/separator'
import { Spinner } from '@noter/ui/components/spinner'
import { Camera } from 'lucide-react'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

export function ProfileSection() {
  const { user, setUser } = useUserStore()

  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) {
      setUsername(user.username || '')
    }
  }, [user])

  if (!user) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Spinner className='size-6' />
      </div>
    )
  }

  const fallbackChar = (user.username || user.email)[0]?.toUpperCase() ?? '?'

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 校验
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: '仅支持 JPG、PNG、WebP、GIF 格式' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: '头像文件不能超过 5MB' })
      return
    }

    setUploading(true)
    setMessage(null)
    try {
      const updated = await userApi.uploadAvatar(file)
      if (updated) setUser(updated)
      setMessage({ type: 'success', text: '头像更新成功' })
    } catch {
      setMessage({ type: 'error', text: '头像上传失败，请稍后重试' })
    } finally {
      setUploading(false)
      // 清空 input 以便重复选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveUsername = async () => {
    if (!username.trim()) {
      setMessage({ type: 'error', text: '用户名不能为空' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const updated = await userApi.updateProfile({ username: username.trim() })
      if (updated) setUser(updated)
      setMessage({ type: 'success', text: '用户名更新成功' })
    } catch {
      setMessage({ type: 'error', text: '更新失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>个人资料</CardTitle>
        <CardDescription>管理你的头像和用户名</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {/* 头像上传 */}
        <div className='flex items-center gap-5'>
          <div className='relative'>
            <Avatar className='size-20'>
              <AvatarImage
                src={user.avatarUrl ?? undefined}
                alt={user.username}
                referrerPolicy='no-referrer'
              />
              <AvatarFallback className='text-xl'>{fallbackChar}</AvatarFallback>
            </Avatar>
            <button
              type='button'
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className='absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100'>
              {uploading ? (
                <Spinner className='size-5 text-white' />
              ) : (
                <Camera className='size-5 text-white' />
              )}
            </button>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              className='hidden'
              onChange={handleAvatarUpload}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <span className='text-sm font-medium'>{user.username}</span>
            <span className='text-muted-foreground text-xs'>{user.email}</span>
            <Button
              variant='outline'
              size='sm'
              className='mt-1 w-fit'
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}>
              {uploading ? '上传中...' : '更换头像'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* 用户名修改 */}
        <div className='flex flex-col gap-3'>
          <label htmlFor='username' className='text-sm font-medium'>
            用户名
          </label>
          <div className='flex items-center gap-3'>
            <Input
              id='username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder='输入用户名'
              className='max-w-xs'
            />
            <Button onClick={handleSaveUsername} disabled={saving || username === user.username}>
              {saving && <Spinner data-icon='inline-start' />}
              保存
            </Button>
          </div>
        </div>

        {/* 邮箱（只读展示） */}
        <div className='flex flex-col gap-2'>
          <label className='text-sm font-medium'>邮箱</label>
          <Input value={user.email} disabled className='max-w-xs' />
          <span className='text-muted-foreground text-xs'>
            如需修改邮箱，请前往"修改邮箱"选项卡
          </span>
        </div>

        {/* 提示信息 */}
        {message && (
          <p
            className={
              message.type === 'success' ? 'text-sm text-green-600' : 'text-destructive text-sm'
            }>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
