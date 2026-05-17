'use client'

/**
 * 用户管理列表页
 *
 * 设计参见 design.md §8.1 (用户管理页):
 *   - UserTable: 邮箱、用户名、角色、状态、注册时间、操作
 *   - 邮箱搜索输入框
 *   - 状态筛选下拉(全部/正常/已封禁/已删除)
 *   - 分页
 *   - 目标用户 role='super_admin' 时隐藏该行所有操作按钮
 *   - 当前登录用户为 admin 时,目标 role='admin' 的行也隐藏操作按钮
 *   - 仅 super_admin 可见"角色切换"操作
 *
 * Requirements: 7, 8, 9, 10, 11
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import ConfirmDialog from '@/components/ConfirmDialog'

interface UserItem {
  id: string
  email: string
  username: string | null
  role: 'user' | 'admin' | 'super_admin'
  notActive: number
  deleted: number
  createdAt: string
}

type StatusFilter = 'all' | 'normal' | 'blocked' | 'deleted'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'normal', label: '正常' },
  { value: 'blocked', label: '已封禁' },
  { value: 'deleted', label: '已删除' }
]

const PAGE_SIZE = 20

export default function UsersPage() {
  const router = useRouter()
  const { role: currentRole } = useAuthStore()

  // ─── 列表状态 ───
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [emailSearch, setEmailSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(false)

  // ─── 操作确认对话框 ───
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'block' | 'unblock' | 'delete' | 'send-password-reset'
    userId: string
    userEmail: string
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE
      }
      if (emailSearch.trim()) params.email = emailSearch.trim()
      if (statusFilter !== 'all') params.status = statusFilter

      const res = await httpClient.get('/api/admin/users', { params })
      setUsers(res.data.data.items)
      setTotal(res.data.data.total)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取用户列表失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [page, emailSearch, statusFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ─── 搜索防抖 ───
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setEmailSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // ─── 操作处理 ───
  const handleAction = (
    type: 'block' | 'unblock' | 'delete' | 'send-password-reset',
    user: UserItem
  ) => {
    setConfirmAction({ type, userId: user.id, userEmail: user.email })
    setConfirmOpen(true)
  }

  const executeAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      await httpClient.post(`/api/admin/users/${confirmAction.userId}/${confirmAction.type}`)
      showToast(getActionSuccessMessage(confirmAction.type))
      setConfirmOpen(false)
      setConfirmAction(null)
      fetchUsers()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '操作失败'
      showToast(message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── 判断是否隐藏操作按钮 ───
  const shouldHideActions = (user: UserItem): boolean => {
    // super_admin 行始终隐藏操作
    if (user.role === 'super_admin') return true
    // admin 登录时,目标 role='admin' 也隐藏
    if (currentRole === 'admin' && user.role === 'admin') return true
    return false
  }

  // ─── 分页 ───
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className='space-y-4'>
      {/* 搜索与筛选 */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-1 gap-3'>
          <input
            type='text'
            placeholder='搜索邮箱...'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className='w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter)
              setPage(1)
            }}
            className='rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <p className='text-sm text-gray-500'>共 {total} 条</p>
      </div>

      {/* 表格 */}
      <div className='overflow-x-auto rounded-lg border border-gray-200 bg-white'>
        <table className='min-w-full divide-y divide-gray-200'>
          <thead className='bg-gray-50'>
            <tr>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                邮箱
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                用户名
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                角色
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                状态
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                注册时间
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                操作
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200'>
            {loading ? (
              <tr>
                <td colSpan={6} className='px-4 py-8 text-center text-sm text-gray-500'>
                  加载中...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className='px-4 py-8 text-center text-sm text-gray-500'>
                  暂无数据
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className='hover:bg-gray-50'>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-900'>
                    {user.email}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {user.username || '-'}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <RoleBadge role={user.role} />
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <StatusBadge notActive={user.notActive} deleted={user.deleted} />
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    {shouldHideActions(user) ? (
                      <span className='text-gray-400'>-</span>
                    ) : (
                      <div className='flex gap-2'>
                        <button
                          className='text-xs text-blue-600 hover:text-blue-800'
                          onClick={() => router.push(`/users/${user.id}`)}>
                          详情
                        </button>
                        {user.notActive === 0 && user.deleted === 0 && (
                          <button
                            className='text-xs text-orange-600 hover:text-orange-800'
                            onClick={() => handleAction('block', user)}>
                            封禁
                          </button>
                        )}
                        {user.notActive === 1 && (
                          <button
                            className='text-xs text-green-600 hover:text-green-800'
                            onClick={() => handleAction('unblock', user)}>
                            解封
                          </button>
                        )}
                        {user.deleted === 0 && (
                          <button
                            className='text-xs text-red-600 hover:text-red-800'
                            onClick={() => handleAction('delete', user)}>
                            删除
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-gray-600'>
            第 {page} / {totalPages} 页
          </p>
          <div className='flex gap-2'>
            <button
              className='rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50'
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <button
              className='rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50'
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}>
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction ? getActionTitle(confirmAction.type) : ''}
        description={
          confirmAction
            ? `确定要对用户 ${confirmAction.userEmail} 执行${getActionLabel(confirmAction.type)}操作吗？`
            : ''
        }
        confirmText={confirmAction ? getActionLabel(confirmAction.type) : '确认'}
        danger={confirmAction?.type !== 'unblock' && confirmAction?.type !== 'send-password-reset'}
        loading={actionLoading}
        onConfirm={executeAction}
        onCancel={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />

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
