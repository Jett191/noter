'use client'

/**
 * 公共文档列表页
 *
 * 设计参见 design.md §8.1 (公共文档页):
 *   - PublicDocsTable: 标题、文件名、状态、分类、标签、版本号、创建时间
 *   - 标题搜索输入框
 *   - 状态/分类/标签筛选
 *   - 分页
 *   - 上传按钮 → 打开 UploadDialog
 *
 * Requirements: 13, 14, 15
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import UploadDialog from '@/components/UploadDialog'

interface CategoryItem {
  id: string
  name: string
}

interface TagItem {
  id: string
  name: string
}

interface PublicDocItem {
  id: string
  title: string
  fileName: string
  fileSize: number
  status: 'processing' | 'ready' | 'failed'
  category: CategoryItem | null
  tags: TagItem[]
  latestVersionNo: number | null
  createdAt: string
}

type StatusFilter = 'all' | 'processing' | 'ready' | 'failed'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'processing', label: '处理中' },
  { value: 'ready', label: '就绪' },
  { value: 'failed', label: '失败' }
]

const PAGE_SIZE = 20

export default function PublicDocumentsPage() {
  const router = useRouter()
  const { role: currentRole } = useAuthStore()

  // ─── 列表状态 ───
  const [docs, setDocs] = useState<PublicDocItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [titleSearch, setTitleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [loading, setLoading] = useState(false)

  // ─── 筛选选项 ───
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [tags, setTags] = useState<TagItem[]>([])

  // ─── 上传对话框 ───
  const [uploadOpen, setUploadOpen] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 加载筛选选项 ───
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [catRes, tagRes] = await Promise.all([
          httpClient.get('/api/admin/public-categories'),
          httpClient.get('/api/admin/public-tags')
        ])
        setCategories(catRes.data.data.items)
        setTags(tagRes.data.data.items)
      } catch {
        // 筛选选项加载失败不阻塞主流程
      }
    }
    loadFilters()
  }, [])

  // ─── 数据获取 ───
  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: PAGE_SIZE
      }
      if (titleSearch.trim()) params.title = titleSearch.trim()
      if (statusFilter !== 'all') params.status = statusFilter
      if (categoryFilter) params.categoryId = categoryFilter
      if (tagFilter) params.tagIds = tagFilter

      const res = await httpClient.get('/api/admin/public-documents', { params })
      setDocs(res.data.data.items)
      setTotal(res.data.data.total)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取公共文档列表失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [page, titleSearch, statusFilter, categoryFilter, tagFilter])

  useEffect(() => {
    fetchDocs()
  }, [fetchDocs])

  // ─── 搜索防抖 ───
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setTitleSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // ─── 分页 ───
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className='space-y-4'>
      {/* 搜索与筛选 */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-1 flex-wrap gap-3'>
          <input
            type='text'
            placeholder='搜索标题...'
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
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(1)
            }}
            className='rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'>
            <option value=''>全部分类</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value)
              setPage(1)
            }}
            className='rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'>
            <option value=''>全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
        <div className='flex items-center gap-3'>
          <p className='text-sm text-gray-500'>共 {total} 条</p>
          <button
            onClick={() => setUploadOpen(true)}
            className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
            上传文档
          </button>
        </div>
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
                文件名
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                状态
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                分类
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                标签
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                版本
              </th>
              <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                创建时间
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200'>
            {loading ? (
              <tr>
                <td colSpan={7} className='px-4 py-8 text-center text-sm text-gray-500'>
                  加载中...
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={7} className='px-4 py-8 text-center text-sm text-gray-500'>
                  暂无数据
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr
                  key={doc.id}
                  className='cursor-pointer hover:bg-gray-50'
                  onClick={() => router.push(`/public-documents/${doc.id}`)}>
                  <td className='px-4 py-3 text-sm font-medium whitespace-nowrap text-blue-600 hover:text-blue-800'>
                    {doc.title}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {doc.fileName}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap'>
                    <DocStatusBadge status={doc.status} />
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {doc.category?.name || '-'}
                  </td>
                  <td className='px-4 py-3 text-sm'>
                    <div className='flex flex-wrap gap-1'>
                      {doc.tags.length > 0 ? (
                        doc.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className='inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700'>
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </div>
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {doc.latestVersionNo ? `v${doc.latestVersionNo}` : '-'}
                  </td>
                  <td className='px-4 py-3 text-sm whitespace-nowrap text-gray-600'>
                    {new Date(doc.createdAt).toLocaleDateString('zh-CN')}
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

      {/* 上传对话框 */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false)
          showToast('上传完成')
          fetchDocs()
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

function DocStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    processing: { label: '处理中', className: 'bg-yellow-100 text-yellow-700' },
    ready: { label: '就绪', className: 'bg-green-100 text-green-700' },
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
