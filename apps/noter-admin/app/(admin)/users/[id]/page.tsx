'use client'

/**
 * 用户详情页
 *
 * 设计参见 design.md §8.1 (用户管理页):
 *   - UserDetailHeader: 展示用户基本信息(邮箱、用户名、角色、状态、注册时间、文档数)
 *   - UserActionMenu: 封禁/解封、软删除、发送密码重置邮件、角色切换(仅 super_admin)
 *   - 每个危险操作弹二次确认 (ConfirmDialog)
 *   - 操作完成后刷新数据 + Toast 反馈
 *
 * Requirements: 7, 8, 9, 10, 11
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import RoleSwitchDialog from '@/components/RoleSwitchDialog'

interface UserDetail {
  id: string
  email: string
  username: string | null
  role: 'user' | 'admin' | 'super_admin'
  notActive: number
  deleted: number
  createdAt: string
  updatedAt: string
  privateDocumentCount: number
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { role: currentRole } = useAuthStore()

  // ─── 用户数据 ───
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // ─── 操作确认对话框 ───
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    'block' | 'unblock' | 'delete' | 'send-password-reset' | null
  >(null)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── 角色切换对话框 ───
  const [roleSwitchOpen, setRoleSwitchOpen] = useState(false)
  const [roleSwitchLoading, setRoleSwitchLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchUser = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpClient.get(`/api/admin/users/${userId}`)
      setUser(res.data.data)
    } catch {
      showToast('获取用户详情失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // ─── 操作处理 ───
  const openConfirm = (action: 'block' | 'unblock' | 'delete' | 'send-password-reset') => {
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  const executeAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      await httpClient.post(`/api/admin/users/${userId}/${confirmAction}`)
      showToast(getActionSuccessMessage(confirmAction))
      setConfirmOpen(false)
      setConfirmAction(null)
      fetchUser()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '操作失败'
      showToast(message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── 角色切换 ───
  const handleRoleSwitch = async (newRole: 'user' | 'admin') => {
    setRoleSwitchLoading(true)
    try {
      await httpClient.post(`/api/admin/users/${userId}/role`, { role: newRole })
      showToast('角色切换成功')
      setRoleSwitchOpen(false)
      fetchUser()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '角色切换失败'
      showToast(message, 'error')
    } finally {
      setRoleSwitchLoading(false)
    }
  }

  // ─── 判断是否隐藏操作 ───
  const shouldHideActions = (): boolean => {
    if (!user) return true
    if (user.role === 'super_admin') return true
    if (currentRole === 'admin' && user.role === 'admin') return true
    return false
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <p className='text-sm text-gray-500'>加载中...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className='flex items-center justify-center py-12'>
        <p className='text-sm text-gray-500'>用户不存在</p>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {/* 返回按钮 */}
      <button
        onClick={() => router.push('/users')}
        className='flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900'>
        ← 返回用户列表
      </button>

      {/* 用户信息头部 */}
      <div className='rounded-lg border border-gray-200 bg-white p-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-2'>
            <h2 className='text-xl font-semibold text-gray-900'>{user.email}</h2>
            <div className='flex flex-wrap gap-4 text-sm text-gray-600'>
              <span>用户名: {user.username || '-'}</span>
              <span>
                角色: <RoleBadge role={user.role} />
              </span>
              <span>
                状态: <StatusBadge notActive={user.notActive} deleted={user.deleted} />
              </span>
            </div>
            <div className='flex flex-wrap gap-4 text-sm text-gray-500'>
              <span>注册时间: {new Date(user.createdAt).toLocaleString('zh-CN')}</span>
              <span>更新时间: {new Date(user.updatedAt).toLocaleString('zh-CN')}</span>
              <span>私有文档数: {user.privateDocumentCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 操作区域 */}
      {!shouldHideActions() && (
        <div className='rounded-lg border border-gray-200 bg-white p-6'>
          <h3 className='mb-4 text-sm font-medium text-gray-900'>用户操作</h3>
          <div className='flex flex-wrap gap-3'>
            {/* 封禁/解封 */}
            {user.notActive === 0 && user.deleted === 0 && (
              <button
                className='rounded-md border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100'
                onClick={() => openConfirm('block')}>
                封禁用户
              </button>
            )}
            {user.notActive === 1 && (
              <button
                className='rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100'
                onClick={() => openConfirm('unblock')}>
                解封用户
              </button>
            )}

            {/* 软删除 */}
            {user.deleted === 0 && (
              <button
                className='rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100'
                onClick={() => openConfirm('delete')}>
                软删除
              </button>
            )}

            {/* 发送密码重置邮件 */}
            <button
              className='rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100'
              onClick={() => openConfirm('send-password-reset')}>
              发送密码重置邮件
            </button>

            {/* 角色切换 — 仅 super_admin 可见 */}
            {currentRole === 'super_admin' && user.role !== 'super_admin' && (
              <button
                className='rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100'
                onClick={() => setRoleSwitchOpen(true)}>
                角色切换
              </button>
            )}
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction ? getActionTitle(confirmAction) : ''}
        description={
          confirmAction
            ? `确定要对用户 ${user.email} 执行${getActionLabel(confirmAction)}操作吗？此操作不可轻易撤销。`
            : ''
        }
        confirmText={confirmAction ? getActionLabel(confirmAction) : '确认'}
        danger={confirmAction !== 'unblock' && confirmAction !== 'send-password-reset'}
        loading={actionLoading}
        onConfirm={executeAction}
        onCancel={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />

      {/* 角色切换对话框 */}
      {user.role !== 'super_admin' && (
        <RoleSwitchDialog
          open={roleSwitchOpen}
          userId={user.id}
          userEmail={user.email}
          currentRole={user.role as 'user' | 'admin'}
          loading={roleSwitchLoading}
          onConfirm={handleRoleSwitch}
          onCancel={() => setRoleSwitchOpen(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 z-50 rounded-md px-4 py-3 text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── 辅助组件 ───

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { label: string; className: string }> = {
    user: { label: '用户', className: 'bg-gray-100 text-gray-700' },
    admin: { label: '管理员', className: 'bg-blue-100 text-blue-700' },
    super_admin: { label: '超级管理员', className: 'bg-purple-100 text-purple-700' }
  }
  const { label, className } = config[role] || config.user
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

function StatusBadge({ notActive, deleted }: { notActive: number; deleted: number }) {
  if (deleted === 1) {
    return (
      <span className='inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'>
        已删除
      </span>
    )
  }
  if (notActive === 1) {
    return (
      <span className='inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>
        已封禁
      </span>
    )
  }
  return (
    <span className='inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>
      正常
    </span>
  )
}

// ─── 辅助函数 ───

function getActionTitle(type: string): string {
  switch (type) {
    case 'block':
      return '封禁用户'
    case 'unblock':
      return '解封用户'
    case 'delete':
      return '删除用户'
    case 'send-password-reset':
      return '发送密码重置邮件'
    default:
      return '确认操作'
  }
}

function getActionLabel(type: string): string {
  switch (type) {
    case 'block':
      return '封禁'
    case 'unblock':
      return '解封'
    case 'delete':
      return '删除'
    case 'send-password-reset':
      return '发送'
    default:
      return '确认'
  }
}

function getActionSuccessMessage(type: string): string {
  switch (type) {
    case 'block':
      return '用户已封禁'
    case 'unblock':
      return '用户已解封'
    case 'delete':
      return '用户已删除'
    case 'send-password-reset':
      return '密码重置邮件已发送'
    default:
      return '操作成功'
  }
}
