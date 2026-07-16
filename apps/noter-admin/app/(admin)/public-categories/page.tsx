'use client'

/**
 * 公共分类管理页
 *
 * 设计参见 design.md §8.1 (分类/标签页):
 *   - CategoryTable: 名称、描述、排序、关联文档数、创建时间
 *   - 新建/编辑/软删对话框
 *
 * Requirements: 20
 */

import { useState, useEffect, useCallback } from 'react'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import ConfirmDialog from '@/components/ConfirmDialog'

interface CategoryItem {
  id: string
  name: string
  description: string | null
  sortOrder: number
  documentCount: number
  createdAt: string
  updatedAt: string
}

export default function PublicCategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)

  // ─── 对话框状态 ───
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSortOrder, setFormSortOrder] = useState(0)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ─── 删除确认 ───
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpClient.get('/api/admin/public-categories')
      setCategories(res.data.data.items)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取分类列表失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // ─── 打开新建对话框 ───
  const openCreateForm = () => {
    setEditingCategory(null)
    setFormName('')
    setFormDescription('')
    setFormSortOrder(0)
    setFormError('')
    setFormOpen(true)
  }

  // ─── 打开编辑对话框 ───
  const openEditForm = (cat: CategoryItem) => {
    setEditingCategory(cat)
    setFormName(cat.name)
    setFormDescription(cat.description || '')
    setFormSortOrder(cat.sortOrder)
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
      if (editingCategory) {
        // 编辑
        await httpClient.patch(`/api/admin/public-categories/${editingCategory.id}`, {
          name: formName.trim(),
          description: formDescription.trim() || null,
          sortOrder: formSortOrder
        })
        showToast('分类已更新')
      } else {
        // 新建
        await httpClient.post('/api/admin/public-categories', {
          name: formName.trim(),
          description: formDescription.trim() || null,
          sortOrder: formSortOrder
        })
        showToast('分类已创建')
      }
      setFormOpen(false)
      fetchCategories()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '操作失败'
      if (status === 409) {
        setFormError('分类名称已存在')
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
      await httpClient.post(`/api/admin/public-categories/${deleteTarget.id}/delete`)
      showToast('分类已删除')
      setDeleteTarget(null)
      fetchCategories()
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
        <h1 className='text-lg font-semibold text-gray-900'>公共分类管理</h1>
        <button
          onClick={openCreateForm}
          className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
          新建分类
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
                描述
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                排序
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
                <td colSpan={6} className='px-4 py-8 text-center text-sm text-gray-500'>
                  加载中...
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={6} className='px-4 py-8 text-center text-sm text-gray-500'>
                  暂无分类
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id} className='hover:bg-gray-50'>
                  <td className='px-4 py-3 text-sm font-medium whitespace-nowrap text-gray-900'>
                    {cat.name}
                  </td>
                  <td className='px-4 py-3 text-sm text-gray-600'>{cat.description || '-'}</td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {cat.sortOrder}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {cat.documentCount}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {new Date(cat.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <div className='flex gap-2'>
                      <button
                        className='text-xs text-blue-600 hover:text-blue-800'
                        onClick={() => openEditForm(cat)}>
                        编辑
                      </button>
                      <button
                        className='text-xs text-red-600 hover:text-red-800'
                        onClick={() => setDeleteTarget(cat)}>
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
              {editingCategory ? '编辑分类' : '新建分类'}
            </h2>

            <form onSubmit={handleFormSubmit} className='mt-4 space-y-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700'>名称 *</label>
                <input
                  type='text'
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='分类名称'
                  autoFocus
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700'>描述</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='分类描述（可选）'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700'>排序</label>
                <input
                  type='number'
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                  className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='0'
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
        title='删除分类'
        description={`确定要删除分类「${deleteTarget?.name}」吗？关联的公共文档将变为"未分类"。`}
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
