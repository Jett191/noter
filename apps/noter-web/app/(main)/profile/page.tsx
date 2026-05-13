'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@noter/ui/components/avatar'
import { Button } from '@noter/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@noter/ui/components/card'
import { Input } from '@noter/ui/components/input'
import { Separator } from '@noter/ui/components/separator'
import { Spinner } from '@noter/ui/components/spinner'
import { ArrowLeft } from 'lucide-react'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

export default function ProfilePage() {
  const router = useRouter()
  const { user, setUser } = useUserStore()

  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (user) {
      setUsername(user.username || '')
      setAvatarUrl(user.avatarUrl || '')
    }
  }, [user])

  if (!user) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Spinner className='size-6' />
      </div>
    )
  }

  const fallbackChar = (user.username || user.email)[0]?.toUpperCase() ?? '?'

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const updated = await userApi.updateProfile({
        username: username.trim() || undefined,
        avatarUrl: avatarUrl.trim() || null
      })
      setUser(updated)
      setMessage({ type: 'success', text: '资料更新成功' })
    } catch {
      setMessage({ type: 'error', text: '更新失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='mx-auto max-w-2xl p-6'>
      <Button
        variant='ghost'
        size='sm'
        className='mb-4'
        onClick={() => router.back()}>
        <ArrowLeft data-icon='inline-start' />
        返回
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>编辑资料</CardTitle>
          <CardDescription>更新你的个人信息</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-6'>
          {/* 头像预览 */}
          <div className='flex items-center gap-4'>
            <Avatar className='size-16'>
              {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
              <AvatarFallback className='text-lg'>{fallbackChar}</AvatarFallback>
            </Avatar>
            <div className='flex flex-col gap-1'>
              <span className='text-sm font-medium'>{user.username}</span>
              <span className='text-xs text-muted-foreground'>{user.email}</span>
            </div>
          </div>

          <Separator />

          {/* 表单 */}
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-2'>
              <label htmlFor='username' className='text-sm font-medium'>
                用户名
              </label>
              <Input
                id='username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder='输入用户名'
              />
            </div>

            <div className='flex flex-col gap-2'>
              <label htmlFor='avatar-url' className='text-sm font-medium'>
                头像链接
              </label>
              <Input
                id='avatar-url'
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder='输入头像图片 URL'
              />
            </div>

            <div className='flex flex-col gap-2'>
              <label className='text-sm font-medium'>邮箱</label>
              <Input value={user.email} disabled />
              <span className='text-xs text-muted-foreground'>邮箱不可修改</span>
            </div>
          </div>

          {/* 提示信息 */}
          {message && (
            <p
              className={
                message.type === 'success'
                  ? 'text-sm text-green-600'
                  : 'text-sm text-destructive'
              }>
              {message.text}
            </p>
          )}

          {/* 保存按钮 */}
          <div className='flex justify-end'>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Spinner data-icon='inline-start' />}
              保存修改
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
