'use client'

/**
 * VersionDrawer — 公共文档版本历史抽屉
 *
 * 滑入面板展示版本列表。点击版本查看双栏对比(该版本 vs 当前内容)。
 * 每条版本行上有回滚按钮。
 * 调用 GET .../versions, GET .../versions/[versionNo], POST .../rollback。
 *
 * Requirements: 17, 18
 */

import { useState, useEffect, useCallback } from 'react'
import httpClient from '@/lib/http/client'
import ConfirmDialog from '@/components/ConfirmDialog'

interface VersionItem {
  versionNo: number
  changeNote: string | null
  editorEmail: string | null
  createdAt: string
  contentLength: number
}

interface VersionDetail {
  versionMarkdown: string
  currentMarkdown: string
}

interface VersionDrawerProps {
  open: boolean
  documentId: string
  onClose: () => void
  onRollback: () => void
}

export default function VersionDrawer({
  open,
  documentId,
  onClose,
  onRollback
}: VersionDrawerProps) {
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [detail, setDetail] = useState<VersionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ─── 回滚确认 ───
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [error, setError] = useState('')

  // ─── 加载版本列表 ───
  const fetchVersions = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const res = await httpClient.get(`/api/admin/public-documents/${documentId}/versions`)
      setVersions(res.data.data.items)
    } catch {
      setError('加载版本列表失败')
    } finally {
      setLoading(false)
    }
  }, [open, documentId])

  useEffect(() => {
    if (open) {
      fetchVersions()
      setSelectedVersion(null)
      setDetail(null)
      setError('')
    }
  }, [open, fetchVersions])

  // ─── 加载版本详情(双栏对比) ───
  const fetchVersionDetail = async (versionNo: number) => {
    setSelectedVersion(versionNo)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await httpClient.get(
        `/api/admin/public-documents/${documentId}/versions/${versionNo}`
      )
      setDetail({
        versionMarkdown: res.data.data.markdownContent,
        currentMarkdown: res.data.data.currentMarkdownContent
      })
    } catch {
      setError('加载版本详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── 回滚 ───
  const handleRollback = async () => {
    if (rollbackTarget === null) return
    setRollbackLoading(true)
    setError('')
    try {
      await httpClient.post(
        `/api/admin/public-documents/${documentId}/versions/${rollbackTarget}/rollback`
      )
      setRollbackTarget(null)
      onRollback()
      fetchVersions()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '回滚失败'
      if ((err as { response?: { status?: number } })?.response?.status === 409) {
        setError('目标版本内容与当前一致,无需回滚')
      } else {
        setError(message)
      }
    } finally {
      setRollbackLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* 遮罩 */}
      <div className='fixed inset-0 z-40 bg-black/30' onClick={onClose} />

      {/* 抽屉面板 */}
      <div className='fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-white shadow-xl'>
        {/* 头部 */}
        <div className='flex items-center justify-between border-b border-gray-200 px-6 py-4'>
          <h2 className='text-lg font-semibold text-gray-900'>版本历史</h2>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className='border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-600'>
            {error}
          </div>
        )}

        {/* 内容区域 */}
        <div className='flex flex-1 overflow-hidden'>
          {/* 左侧:版本列表 */}
          <div className='w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200'>
            {loading ? (
              <div className='p-4 text-center text-sm text-gray-500'>加载中...</div>
            ) : versions.length === 0 ? (
              <div className='p-4 text-center text-sm text-gray-500'>暂无版本记录</div>
            ) : (
              <div className='divide-y divide-gray-100'>
                {versions.map((v) => (
                  <div
                    key={v.versionNo}
                    className={`cursor-pointer px-4 py-3 transition-colors hover:bg-gray-50 ${
                      selectedVersion === v.versionNo ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => fetchVersionDetail(v.versionNo)}>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm font-medium text-gray-900'>v{v.versionNo}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRollbackTarget(v.versionNo)
                        }}
                        className='rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-100'
                        title='回滚到此版本'>
                        回滚
                      </button>
                    </div>
                    {v.changeNote && (
                      <p className='mt-1 truncate text-xs text-gray-600'>{v.changeNote}</p>
                    )}
                    <div className='mt-1 flex items-center gap-2 text-xs text-gray-400'>
                      <span>{v.editorEmail || '系统'}</span>
                      <span>·</span>
                      <span>{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右侧:版本详情(双栏对比) */}
          <div className='flex-1 overflow-y-auto'>
            {selectedVersion === null ? (
              <div className='flex h-full items-center justify-center text-sm text-gray-400'>
                选择一个版本查看详情
              </div>
            ) : detailLoading ? (
              <div className='flex h-full items-center justify-center text-sm text-gray-500'>
                加载中...
              </div>
            ) : detail ? (
              <div className='flex h-full'>
                {/* 该版本内容 */}
                <div className='flex flex-1 flex-col border-r border-gray-100'>
                  <div className='border-b border-gray-100 bg-gray-50 px-4 py-2'>
                    <span className='text-xs font-medium text-gray-500'>
                      v{selectedVersion} 内容
                    </span>
                  </div>
                  <div className='flex-1 overflow-y-auto p-4'>
                    <pre className='font-mono text-xs whitespace-pre-wrap text-gray-700'>
                      {detail.versionMarkdown}
                    </pre>
                  </div>
                </div>
                {/* 当前内容 */}
                <div className='flex flex-1 flex-col'>
                  <div className='border-b border-gray-100 bg-gray-50 px-4 py-2'>
                    <span className='text-xs font-medium text-gray-500'>当前内容</span>
                  </div>
                  <div className='flex-1 overflow-y-auto p-4'>
                    <pre className='font-mono text-xs whitespace-pre-wrap text-gray-700'>
                      {detail.currentMarkdown}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 回滚确认对话框 */}
      <ConfirmDialog
        open={rollbackTarget !== null}
        title='回滚版本'
        description={`确定要回滚到 v${rollbackTarget} 吗？当前内容将被归档为新版本,然后恢复为目标版本的内容。`}
        confirmText='回滚'
        danger={false}
        loading={rollbackLoading}
        onConfirm={handleRollback}
        onCancel={() => setRollbackTarget(null)}
      />
    </>
  )
}
