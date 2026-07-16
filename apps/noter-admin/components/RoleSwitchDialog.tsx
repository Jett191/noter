'use client'

/**
 * RoleSwitchDialog — 角色切换对话框
 *
 * 仅 super_admin 可见,只允许 user ↔ admin 切换。
 * 展示当前角色与目标角色,确认后调用 POST /api/admin/users/[id]/role。
 *
 * Requirements: 11
 */

import { useState } from 'react'

export interface RoleSwitchDialogProps {
  /** 是否显示 */
  open: boolean
  /** 目标用户 ID */
  userId: string
  /** 目标用户邮箱(展示用) */
  userEmail: string
  /** 目标用户当前角色 */
  currentRole: 'user' | 'admin'
  /** 是否正在加载 */
  loading?: boolean
  /** 确认回调,传入新角色 */
  onConfirm: (newRole: 'user' | 'admin') => void
  /** 取消/关闭回调 */
  onCancel: () => void
}

export default function RoleSwitchDialog({
  open,
  userEmail,
  currentRole,
  loading = false,
  onConfirm,
  onCancel
}: RoleSwitchDialogProps) {
  const targetRole: 'user' | 'admin' = currentRole === 'user' ? 'admin' : 'user'
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>(targetRole)

  if (!open) return null

  const roleLabel = (role: string) => {
    switch (role) {
      case 'user':
        return '普通用户'
      case 'admin':
        return '管理员'
      case 'super_admin':
        return '超级管理员'
      default:
        return role
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='role-switch-title'>
      <div className='w-full max-w-md rounded-lg bg-white p-6 shadow-xl'>
        <h2 id='role-switch-title' className='text-lg font-semibold text-gray-900'>
          角色切换
        </h2>

        <div className='mt-4 space-y-3'>
          <p className='text-sm text-gray-600'>
            用户: <span className='font-medium text-gray-900'>{userEmail}</span>
          </p>
          <p className='text-sm text-gray-600'>
            当前角色: <span className='font-medium text-gray-900'>{roleLabel(currentRole)}</span>
          </p>

          <div className='mt-4'>
            <label className='mb-2 block text-sm font-medium text-gray-700'>切换为:</label>
            <div className='flex gap-3'>
              {(['user', 'admin'] as const)
                .filter((r) => r !== currentRole)
                .map((role) => (
                  <button
                    key={role}
                    type='button'
                    className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                      selectedRole === role
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedRole(role)}>
                    {roleLabel(role)}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className='mt-6 flex justify-end gap-3'>
          <button
            type='button'
            className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
            onClick={onCancel}
            disabled={loading}>
            取消
          </button>
          <button
            type='button'
            className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
            onClick={() => onConfirm(selectedRole)}
            disabled={loading}>
            {loading ? '处理中...' : '确认切换'}
          </button>
        </div>
      </div>
    </div>
  )
}
