'use client'

/**
 * 普通用户私有文档管理页
 *
 * 设计参见 design.md §8.1 (普通文档页):
 *   - PrivateDocsTable: 标题、owner 邮箱、状态、创建时间、操作
 *   - owner 邮箱搜索输入框
 *   - 状态筛选下拉(全部/正常/已删除)
 *   - 强制软删按钮 + ConfirmDialog 二次确认
 *   - 分页
 *
 * Requirements: 22
 */

import { useState, useEffect, useCallback } from 'react'
import httpClient from '@/lib/http/client'
import ConfirmDialog from '@/components/ConfirmDialog'

interface DocumentItem {
  id: string
  title: string | null
  status: string
  deleted: number
  createdAt: string
  updatedAt: string
  owner: {
    id: string
    email: string
    username: string | null
  } | null
}

type StatusFilter = 'all' | 'normal' | 'deleted'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'normal', label: '正常' },
  { value: 'deleted', label: '已删除' }
]

const PAGE_SIZE = 20

export default function DocumentsPage() {
  // ─── 列表状态 ───
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [ownerEmailSearch, setOwnerEmailSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(false)

  // ─── 操作确认对话框 ───
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE
      }
      if (ownerEmailSearch.trim()) params.ownerEmail = ownerEmailSearch.trim()
      if (statusFilter !== 'all') params.status = statusFilter

      const res = await httpClient.get('/api/admin/documents', { params })
      setDocuments(res.data.data.items)
      setTotal(res.data.data.total)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取文档列表失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [page, ownerEmailSearch, statusFilter])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ─── 搜索防抖 ───
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setOwnerEmailSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // ─── 强制软删操作 ───
  const handleForceDelete = (doc: DocumentItem) => {
    setDeleteTarget(doc)
    setConfirmOpen(true)
  }

  const executeDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await httpClient.post(`/api/admin/documents/${deleteTarget.id}/delete`)
      showToast('文档已强制删除')
      setConfirmOpen(false)
      setDeleteTarget(null)
      fetchDocuments()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '操作失败'
      showToast(message, 'error')
    } finally {
      setActionLoading(false)
    }
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
            placeholder='搜索 owner 邮箱...'
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
                标题
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                Owner 邮箱
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                状态
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                创建时间
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                操作
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200'>
            {loading ? (
              <tr>
                <td colSpan={5} className='px-4 py-8 text-center text-sm text-gray-500'>
                  加载中...
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={5} className='px-4 py-8 text-center text-sm text-gray-500'>
                  暂无数据
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className='hover:bg-gray-50'>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-900'>
                    {doc.title || '无标题'}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {doc.owner?.email || '-'}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <DocStatusBadge status={doc.status} deleted={doc.deleted} />
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    {doc.deleted === 0 ? (
                      <button
                        className='text-xs font-medium text-red-600 hover:text-red-800'
                        onClick={() => handleForceDelete(doc)}>
                        强制删除
                      </button>
                    ) : (
                      <span className='text-xs text-gray-400'>已删除</span>
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
        title='强制删除文档'
        description={
          deleteTarget
            ? `确定要强制删除文档「${deleteTarget.title || '无标题'}」吗？此操作将对该文档执行软删除。`
            : ''
        }
        confirmText='强制删除'
        danger
        loading={actionLoading}
        onConfirm={executeDelete}
        onCancel={() => {
          setConfirmOpen(false)
          setDeleteTarget(null)
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

function DocStatusBadge({ status, deleted }: { status: string; deleted: number }) {
  if (deleted === 1) {
    return (
      <span className='inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'>
        已删除
      </span>
    )
  }
  const config: Record<string, { label: string; className: string }> = {
    processing: { label: '处理中', className: 'bg-yellow-100 text-yellow-700' },
    ready: { label: '正常', className: 'bg-green-100 text-green-700' },
    failed: { label: '失败', className: 'bg-red-100 text-red-700' }
  }
  const { label, className } = config[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-700'
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
