'use client'

/**
 * 公共文档详情页
 *
 * 设计参见 design.md §8.1 (公共文档页):
 *   - 基础信息 + 处理状态 + 标签 + 分类
 *   - 当前 markdown 渲染 (react-markdown)
 *   - 4 个操作入口:编辑元数据、在线编辑 Markdown、版本历史、软删除
 *   - 回滚按钮放在 VersionDrawer 内
 *   - status='processing' 时前端轮询直到 ready/failed
 *
 * Requirements: 14, 15, 16, 17, 18, 19
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import httpClient from '@/lib/http/client'
import { useAuthStore } from '@/stores/useAuthStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import MetadataForm from '@/components/MetadataForm'
import MarkdownEditor from '@/components/MarkdownEditor'
import VersionDrawer from '@/components/VersionDrawer'

interface CategoryItem {
  id: string
  name: string
}

interface TagItem {
  id: string
  name: string
}

interface DocDetail {
  id: string
  title: string
  fileName: string
  fileSize: number
  fileExt: string
  status: 'processing' | 'ready' | 'failed'
  shortDescription: string | null
  language: string | null
  createdAt: string
  updatedAt: string
  category: CategoryItem | null
  tags: TagItem[]
  markdownContent: string | null
  latestVersionNo: number | null
  signedUrl: string | null
}

export default function PublicDocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [doc, setDoc] = useState<DocDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // ─── 操作面板状态 ───
  const [showMetadataForm, setShowMetadataForm] = useState(false)
  const [showMarkdownEditor, setShowMarkdownEditor] = useState(false)
  const [showVersionDrawer, setShowVersionDrawer] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 轮询 ref ───
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── 数据获取 ───
  const fetchDoc = useCallback(async () => {
    try {
      const res = await httpClient.get(`/api/admin/public-documents/${documentId}`)
      setDoc(res.data.data)
      return res.data.data as DocDetail
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取文档详情失败'
      showToast(message, 'error')
      return null
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    fetchDoc()
  }, [fetchDoc])

  // ─── 轮询:status='processing' 时每 3 秒刷新 ───
  useEffect(() => {
    if (doc?.status === 'processing') {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchDoc()
        if (updated && updated.status !== 'processing') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        }
      }, 3000)
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [doc?.status, fetchDoc])

  // ─── 软删除 ───
  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await httpClient.post(`/api/admin/public-documents/${documentId}/delete`)
      showToast('文档已删除')
      setTimeout(() => router.push('/public-documents'), 1000)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '删除失败'
      showToast(message, 'error')
    } finally {
      setDeleteLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <p className='text-sm text-gray-500'>加载中...</p>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className='flex items-center justify-center py-12'>
        <p className='text-sm text-gray-500'>文档不存在</p>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {/* 返回按钮 + 标题 */}
      <div className='flex items-center gap-4'>
        <button
          onClick={() => router.push('/public-documents')}
          className='text-sm text-gray-500 hover:text-gray-700'>
          ← 返回列表
        </button>
        <h1 className='text-xl font-semibold text-gray-900'>{doc.title}</h1>
      </div>

      {/* 处理状态提示 */}
      {doc.status === 'processing' && (
        <div className='flex items-center gap-2 rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800'>
          <svg className='h-4 w-4 animate-spin' viewBox='0 0 24 24' fill='none'>
            <circle
              className='opacity-25'
              cx='12'
              cy='12'
              r='10'
              stroke='currentColor'
              strokeWidth='4'
            />
            <path
              className='opacity-75'
              fill='currentColor'
              d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
            />
          </svg>
          文档正在处理中,页面将自动刷新...
        </div>
      )}

      {doc.status === 'failed' && (
        <div className='rounded-md bg-red-50 px-4 py-3 text-sm text-red-800'>
          文档处理失败,请检查文件格式或重新上传。
        </div>
      )}

      {/* 基础信息卡片 */}
      <div className='rounded-lg border border-gray-200 bg-white p-6'>
        <h2 className='mb-4 text-sm font-semibold text-gray-500 uppercase'>基础信息</h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <InfoItem label='文件名' value={doc.fileName} />
          <InfoItem label='文件大小' value={`${(doc.fileSize / 1024 / 1024).toFixed(2)} MB`} />
          <InfoItem label='文件类型' value={doc.fileExt || '-'} />
          <InfoItem label='状态'>
            <DocStatusBadge status={doc.status} />
          </InfoItem>
          <InfoItem label='分类' value={doc.category?.name || '未分类'} />
          <InfoItem label='版本' value={doc.latestVersionNo ? `v${doc.latestVersionNo}` : '-'} />
          <InfoItem label='语言' value={doc.language || '-'} />
          <InfoItem label='创建时间' value={new Date(doc.createdAt).toLocaleString('zh-CN')} />
          <InfoItem label='更新时间' value={new Date(doc.updatedAt).toLocaleString('zh-CN')} />
        </div>

        {doc.shortDescription && (
          <div className='mt-4'>
            <p className='text-xs font-medium text-gray-500'>简介</p>
            <p className='mt-1 text-sm text-gray-700'>{doc.shortDescription}</p>
          </div>
        )}

        {/* 标签 */}
        {doc.tags.length > 0 && (
          <div className='mt-4'>
            <p className='text-xs font-medium text-gray-500'>标签</p>
            <div className='mt-1 flex flex-wrap gap-2'>
              {doc.tags.map((tag) => (
                <span
                  key={tag.id}
                  className='inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700'>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className='flex flex-wrap gap-3'>
        <button
          onClick={() => setShowMetadataForm(true)}
          className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'>
          编辑元数据
        </button>
        <button
          onClick={() => setShowMarkdownEditor(true)}
          className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
          disabled={doc.status === 'processing'}>
          在线编辑 Markdown
        </button>
        <button
          onClick={() => setShowVersionDrawer(true)}
          className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'>
          版本历史
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className='rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50'>
          软删除
        </button>
      </div>

      {/* Markdown 渲染 */}
      {doc.markdownContent && (
        <div className='rounded-lg border border-gray-200 bg-white p-6'>
          <h2 className='mb-4 text-sm font-semibold text-gray-500 uppercase'>文档内容</h2>
          <div className='prose prose-sm max-w-none'>
            <ReactMarkdown>{doc.markdownContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 元数据编辑表单 */}
      {showMetadataForm && (
        <MetadataForm
          documentId={documentId}
          initialData={{
            title: doc.title,
            shortDescription: doc.shortDescription || '',
            language: doc.language || '',
            categoryId: doc.category?.id || '',
            tagIds: doc.tags.map((t) => t.id)
          }}
          onClose={() => setShowMetadataForm(false)}
          onSuccess={() => {
            setShowMetadataForm(false)
            showToast('元数据已更新')
            fetchDoc()
          }}
        />
      )}

      {/* Markdown 编辑器 */}
      {showMarkdownEditor && (
        <MarkdownEditor
          documentId={documentId}
          initialContent={doc.markdownContent || ''}
          onClose={() => setShowMarkdownEditor(false)}
          onSuccess={() => {
            setShowMarkdownEditor(false)
            showToast('内容已保存')
            fetchDoc()
          }}
        />
      )}

      {/* 版本历史抽屉 */}
      <VersionDrawer
        open={showVersionDrawer}
        documentId={documentId}
        onClose={() => setShowVersionDrawer(false)}
        onRollback={() => {
          showToast('回滚成功')
          fetchDoc()
        }}
      />

      {/* 软删除确认 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title='删除公共文档'
        description={`确定要删除文档「${doc.title}」吗？删除后文档将不再对用户可见,但版本历史和标签关联将保留。`}
        confirmText='删除'
        danger
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
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

function InfoItem({
  label,
  value,
  children
}: {
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div>
      <p className='text-xs font-medium text-gray-500'>{label}</p>
      {children ? (
        <div className='mt-1'>{children}</div>
      ) : (
        <p className='mt-1 text-sm text-gray-900'>{value}</p>
      )}
    </div>
  )
}

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
