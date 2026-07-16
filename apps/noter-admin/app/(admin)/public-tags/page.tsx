'use client'

/**
 * 公共标签管理页
 *
 * 设计参见 design.md §8.1 (分类/标签页):
 *   - TagTable: 名称、关联文档数、创建时间
 *   - 新建/编辑/软删对话框
 *   - name 重复时显示 409 错误
 *
 * Requirements: 21
 */

import { useState, useEffect, useCallback } from 'react'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import ConfirmDialog from '@/components/ConfirmDialog'

interface TagItem {
  id: string
  name: string
  documentCount: number
  createdAt: string
  updatedAt: string
}

export default function PublicTagsPage() {
  const [tags, setTags] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(false)

  // ─── 对话框状态 ───
  const [formOpen, setFormOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ─── 删除确认 ───
  const [deleteTarget, setDeleteTarget] = useState<TagItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchTags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpClient.get('/api/admin/public-tags')
      setTags(res.data.data.items)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取标签列表失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // ─── 打开新建对话框 ───
  const openCreateForm = () => {
    setEditingTag(null)
    setFormName('')
    setFormError('')
    setFormOpen(true)
  }

  // ─── 打开编辑对话框 ───
  const openEditForm = (tag: TagItem) => {
    setEditingTag(tag)
    setFormName(tag.name)
    setFormError('')
    setFormOpen(true)
  }

  // ─── 提交表单 ───
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError('名称不能为空')
      return
    }

    setFormSaving(true)
    setFormError('')

    try {
      if (editingTag) {
        // 编辑
        await httpClient.patch(`/api/admin/public-tags/${editingTag.id}`, {
          name: formName.trim()
        })
        showToast('标签已更新')
      } else {
        // 新建
        await httpClient.post('/api/admin/public-tags', {
          name: formName.trim()
        })
        showToast('标签已创建')
      }
      setFormOpen(false)
      fetchTags()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '操作失败'
      if (status === 409) {
        setFormError('标签名称已存在,请使用其他名称')
      } else {
        setFormError(message)
      }
    } finally {
      setFormSaving(false)
    }
  }

  // ─── 删除 ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await httpClient.post(`/api/admin/public-tags/${deleteTarget.id}/delete`)
      showToast('标签已删除')
      setDeleteTarget(null)
      fetchTags()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '删除失败'
      showToast(message, 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className='space-y-4'>
      {/* 头部 */}
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-semibold text-gray-900'>公共标签管理</h1>
        <button
          onClick={openCreateForm}
          className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
          新建标签
        </button>
      </div>

      {/* 表格 */}
      <div className='overflow-x-auto rounded-lg border border-gray-200 bg-white'>
        <table className='min-w-full divide-y divide-gray-200'>
          <thead className='bg-gray-50'>
            <tr>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                名称
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                关联文档数
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
                <td colSpan={4} className='px-4 py-8 text-center text-sm text-gray-500'>
                  加载中...
                </td>
              </tr>
            ) : tags.length === 0 ? (
              <tr>
                <td colSpan={4} className='px-4 py-8 text-center text-sm text-gray-500'>
                  暂无标签
                </td>
              </tr>
            ) : (
              tags.map((tag) => (
                <tr key={tag.id} className='hover:bg-gray-50'>
                  <td className='px-4 py-3 text-sm font-medium whitespace-nowrap text-gray-900'>
                    <span className='inline-flex items-center gap-1.5'>
                      <span className='inline-block h-2 w-2 rounded-full bg-blue-500' />
                      {tag.name}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {tag.documentCount}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {new Date(tag.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <div className='flex gap-2'>
                      <button
                        className='text-xs text-blue-600 hover:text-blue-800'
                        onClick={() => openEditForm(tag)}>
                        编辑
                      </button>
                      <button
                        className='text-xs text-red-600 hover:text-red-800'
                        onClick={() => setDeleteTarget(tag)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新建/编辑对话框 */}
      {formOpen && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
          onClick={(e) => {
            if (e.target === e.currentTarget && !formSaving) setFormOpen(false)
          }}
          role='dialog'
          aria-modal='true'>
          <div className='w-full max-w-md rounded-lg bg-white p-6 shadow-xl'>
            <h2 className='text-lg font-semibold text-gray-900'>
              {editingTag ? '编辑标签' : '新建标签'}
            </h2>

            <form onSubmit={handleFormSubmit} className='mt-4 space-y-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700'>名称 *</label>
                <input
                  type='text'
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='标签名称'
                  autoFocus
                />
              </div>

              {formError && <p className='text-sm text-red-600'>{formError}</p>}

              <div className='flex justify-end gap-3 pt-2'>
                <button
                  type='button'
                  className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
                  onClick={() => setFormOpen(false)}
                  disabled={formSaving}>
                  取消
                </button>
                <button
                  type='submit'
                  className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
                  disabled={formSaving}>
                  {formSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title='删除标签'
        description={`确定要删除标签「${deleteTarget?.name}」吗？关联的公共文档将取消该标签。`}
        confirmText='删除'
        danger
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
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
