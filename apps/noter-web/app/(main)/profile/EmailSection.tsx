'use client'

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@noter/ui/components/card'
import { Input } from '@noter/ui/components/input'
import { Spinner } from '@noter/ui/components/spinner'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'

export function EmailSection() {
  const { user } = useUserStore()
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async () => {
    setMessage(null)

    if (!newEmail.trim()) {
      setMessage({ type: 'error', text: '请输入新邮箱地址' })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      setMessage({ type: 'error', text: '请输入有效的邮箱地址' })
      return
    }

    if (newEmail === user?.email) {
      setMessage({ type: 'error', text: '新邮箱与当前邮箱相同' })
      return
    }

    setSaving(true)
    try {
      await userApi.changeEmail({ newEmail: newEmail.trim() })
      setMessage({ type: 'success', text: '确认邮件已发送到新邮箱，请查收并点击确认链接' })
      setNewEmail('')
    } catch {
      setMessage({ type: 'error', text: '邮箱修改失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改邮箱</CardTitle>
        <CardDescription>修改后需要通过新邮箱确认才能生效</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <div className='flex flex-col gap-2'>
          <label className='text-sm font-medium'>当前邮箱</label>
          <Input value={user?.email ?? ''} disabled className='max-w-sm' />
        </div>

        <div className='flex flex-col gap-2'>
          <label htmlFor='new-email' className='text-sm font-medium'>
            新邮箱
          </label>
          <Input
            id='new-email'
            type='email'
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder='输入新邮箱地址'
            className='max-w-sm'
          />
        </div>

        {message && (
          <p
            className={
              message.type === 'success' ? 'text-sm text-green-600' : 'text-destructive text-sm'
            }>
            {message.text}
          </p>
        )}

        <div>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Spinner data-icon='inline-start' />}
            发送确认邮件
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
