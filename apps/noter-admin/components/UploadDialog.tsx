'use client'

/**
 * UploadDialog — 公共文档批量上传对话框
 *
 * 支持多文件选择/拖拽上传,单批 ≤20、单文件 ≤50MB。
 * 展示每文件上传进度与状态。
 * 调用 POST /api/admin/public-documents/upload (FormData)。
 *
 * Requirements: 13
 */

import { useState, useRef, useCallback } from 'react'
import httpClient from '@/lib/http/client'

const MAX_FILES = 20
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'csv',
  'html',
  'htm',
  'epub'
])

interface FileUploadState {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'failed'
  error?: string
}

interface UploadDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function UploadDialog({ open, onClose, onSuccess }: UploadDialogProps) {
  const [files, setFiles] = useState<FileUploadState[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const getFileExtension = (name: string): string => {
    const lastDot = name.lastIndexOf('.')
    if (lastDot < 0 || lastDot === name.length - 1) return ''
    return name.slice(lastDot + 1).toLowerCase()
  }

  const validateFiles = (newFiles: File[]): { valid: File[]; errors: string[] } => {
    const errors: string[] = []
    const valid: File[] = []

    const totalCount = files.length + newFiles.length
    if (totalCount > MAX_FILES) {
      errors.push(`单批最多上传 ${MAX_FILES} 个文件,当前已选 ${files.length} 个`)
      return { valid, errors }
    }

    for (const file of newFiles) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" 超过 50MB 限制`)
        continue
      }
      const ext = getFileExtension(file.name)
      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        errors.push(`"${file.name}" 格式不支持 (${ext || '无扩展名'})`)
        continue
      }
      valid.push(file)
    }

    return { valid, errors }
  }

  const addFiles = (newFiles: File[]) => {
    const { valid, errors } = validateFiles(newFiles)
    if (errors.length > 0) {
      alert(errors.join('\n'))
    }
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid.map((f) => ({ file: f, status: 'pending' as const }))])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length > 0) addFiles(selected)
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const dropped = Array.from(e.dataTransfer.files)
      if (dropped.length > 0) addFiles(dropped)
    },
    [files]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)

    // Mark all as uploading
    setFiles((prev) => prev.map((f) => ({ ...f, status: 'uploading' as const })))

    try {
      const formData = new FormData()
      for (const f of files) {
        formData.append('files', f.file)
      }

      const res = await httpClient.post('/api/admin/public-documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const results = res.data.data.results as Array<{
        fileName: string
        status: 'processing' | 'failed'
        error?: string
      }>

      // Update file statuses based on response
      setFiles((prev) =>
        prev.map((f) => {
          const result = results.find((r) => r.fileName === f.file.name)
          if (result) {
            return {
              ...f,
              status: result.status === 'failed' ? 'failed' : 'success',
              error: result.error
            }
          }
          return { ...f, status: 'success' }
        })
      )

      // Check if all succeeded
      const allSuccess = results.every((r) => r.status !== 'failed')
      if (allSuccess) {
        setTimeout(() => {
          onSuccess()
          resetState()
        }, 1000)
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '上传失败'
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'failed', error: message })))
    } finally {
      setUploading(false)
    }
  }

  const resetState = () => {
    setFiles([])
    setUploading(false)
    setDragOver(false)
  }

  const handleClose = () => {
    if (uploading) return
    resetState()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) handleClose()
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='upload-dialog-title'>
      <div className='w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl'>
        <h2 id='upload-dialog-title' className='text-lg font-semibold text-gray-900'>
          上传公共文档
        </h2>
        <p className='mt-1 text-sm text-gray-500'>
          支持 PDF、Word、TXT、Markdown 等格式,单批最多 {MAX_FILES} 个文件,单文件最大 50MB
        </p>

        {/* 拖拽区域 */}
        <div
          className={`mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}>
          <svg
            className='mb-2 h-8 w-8 text-gray-400'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
            />
          </svg>
          <p className='text-sm text-gray-600'>拖拽文件到此处,或点击选择文件</p>
          <input
            ref={fileInputRef}
            type='file'
            multiple
            className='hidden'
            onChange={handleFileSelect}
            accept='.pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.csv,.html,.htm,.epub'
          />
        </div>

        {/* 文件列表 */}
        {files.length > 0 && (
          <div className='mt-4 max-h-[240px] space-y-2 overflow-y-auto'>
            {files.map((f, index) => (
              <div
                key={`${f.file.name}-${index}`}
                className='flex items-center justify-between rounded-md border border-gray-200 px-3 py-2'>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium text-gray-700'>{f.file.name}</p>
                  <p className='text-xs text-gray-500'>
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className='ml-3 flex items-center gap-2'>
                  <FileStatusBadge status={f.status} error={f.error} />
                  {f.status === 'pending' && !uploading && (
                    <button
                      onClick={() => removeFile(index)}
                      className='text-gray-400 hover:text-red-500'
                      title='移除'>
                      <svg
                        className='h-4 w-4'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'>
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M6 18L18 6M6 6l12 12'
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className='mt-6 flex justify-end gap-3'>
          <button
            type='button'
            className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
            onClick={handleClose}
            disabled={uploading}>
            取消
          </button>
          <button
            type='button'
            className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
            onClick={handleUpload}
            disabled={uploading || files.length === 0}>
            {uploading ? '上传中...' : `上传 (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

function FileStatusBadge({ status, error }: { status: string; error?: string }) {
  switch (status) {
    case 'pending':
      return <span className='text-xs text-gray-500'>待上传</span>
    case 'uploading':
      return (
        <span className='flex items-center gap-1 text-xs text-blue-600'>
          <svg className='h-3 w-3 animate-spin' viewBox='0 0 24 24' fill='none'>
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
          上传中
        </span>
      )
    case 'success':
      return <span className='text-xs text-green-600'>✓ 成功</span>
    case 'failed':
      return (
        <span className='text-xs text-red-600' title={error}>
          ✗ 失败
        </span>
      )
    default:
      return null
  }
}
