'use client'

import { useState, useEffect } from 'react'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/lib/axios/auth'
import { useFormState } from '@/hooks/useFormState'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { Field, FieldGroup, FieldLabel } from '@noter/ui/components/field'
import { Spinner } from '@noter/ui/components/spinner'
import { User, Pencil } from 'lucide-react'

interface ProfileForm {
  username: string
  avatar_url: string
}

export default function ProfilePage() {
  const user = useUserStore((s) => s.user)
  const setUser = useUserStore((s) => s.setUser)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { form, handleChange, setForm } = useFormState<ProfileForm>({
    username: '',
    avatar_url: ''
  })

  // 同步用户数据到表单
  useEffect(() => {
    if (user) {
      setForm({
        username: user.username ?? '',
        avatar_url: user.avatarUrl ?? ''
      })
    }
  }, [user, setForm])

  // 提交更新
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    try {
      setSaving(true)
      const updated = await userApi.updateProfile({
        username: form.username || undefined,
        avatar_url: form.avatar_url || undefined
      })
      setUser(updated)
      setEditing(false)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  // 取消编辑，恢复原始数据
  function handleCancel() {
    if (user) {
      setForm({
        username: user.username ?? '',
        avatar_url: user.avatarUrl ?? ''
      })
    }
    setEditing(false)
    setMessage(null)
  }

  return (
    <div className='mx-auto max-w-lg p-6'>
      <h1 className='mb-6 text-2xl font-bold'>Profile</h1>

      {/* 头像展示 */}
      <div className='mb-6 flex items-center gap-4'>
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username ?? 'Avatar'}
            className='h-16 w-16 rounded-full object-cover'
          />
        ) : (
          <div className='bg-muted flex h-16 w-16 items-center justify-center rounded-full'>
            <User className='text-muted-foreground h-8 w-8' />
          </div>
        )}
        <div>
          <p className='text-lg font-medium'>{user?.username}</p>
          <p className='text-muted-foreground text-sm'>{user?.email}</p>
        </div>
      </div>

      {message && (
        <p
          className={`mb-4 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {editing ? (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='username'>Username</FieldLabel>
              <Input
                id='username'
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                className='bg-background'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='avatar_url'>Avatar URL</FieldLabel>
              <Input
                id='avatar_url'
                value={form.avatar_url}
                placeholder='https://example.com/avatar.png'
                onChange={(e) => handleChange('avatar_url', e.target.value)}
                className='bg-background'
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input value={user?.email ?? ''} disabled className='bg-muted' />
            </Field>
            <div className='flex gap-2'>
              <Button type='submit' disabled={saving}>
                {saving && <Spinner data-icon='inline-start' />}
                Save
              </Button>
              <Button type='button' variant='outline' onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <div className='space-y-4'>
          <div>
            <p className='text-muted-foreground text-sm'>Username</p>
            <p>{user?.username || '—'}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>Avatar URL</p>
            <p className='truncate'>{user?.avatarUrl || '—'}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>Email</p>
            <p>{user?.email || '—'}</p>
          </div>
          <Button variant='outline' onClick={() => setEditing(true)}>
            <Pencil className='h-4 w-4' />
            Edit Profile
          </Button>
        </div>
      )}
    </div>
  )
}
