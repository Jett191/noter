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
import { userApi } from '@/lib/axios/auth'

export function PasswordSection() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async () => {
    setMessage(null)

    if (!oldPassword) {
      setMessage({ type: 'error', text: '请输入当前密码' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少 6 个字符' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }

    setSaving(true)
    try {
      await userApi.changePassword({ oldPassword, newPassword })
      setMessage({ type: 'success', text: '密码修改成功' })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setMessage({ type: 'error', text: '密码修改失败，请检查当前密码是否正确' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>定期更换密码有助于保护账号安全</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <div className='flex flex-col gap-2'>
          <label htmlFor='old-password' className='text-sm font-medium'>
            当前密码
          </label>
          <Input
            id='old-password'
            type='password'
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder='输入当前密码'
            className='max-w-sm'
          />
        </div>

        <div className='flex flex-col gap-2'>
          <label htmlFor='new-password' className='text-sm font-medium'>
            新密码
          </label>
          <Input
            id='new-password'
            type='password'
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder='至少 6 个字符'
            className='max-w-sm'
          />
        </div>

        <div className='flex flex-col gap-2'>
          <label htmlFor='confirm-password' className='text-sm font-medium'>
            确认新密码
          </label>
          <Input
            id='confirm-password'
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder='再次输入新密码'
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
            确认修改
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
