'use client'

import { useCallback, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@noter/ui/components/dialog'
import { Button } from '@noter/ui/components/button'
import { Upload, FileText, XCircle } from 'lucide-react'
import { cn } from '@noter/ui/lib/utils'
import { documentApi } from '@/lib/axios/documents'
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '@/utils/feature/documents/schemas'
import UploadProgress from './UploadProgress'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: () => void
}

export function UploadDialog({ open, onOpenChange, onUploadComplete }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setFile(null)
    setValidationError(null)
    setUploading(false)
    setUploadError(null)
    setDocumentId(null)
    setDragOver(false)
  }, [])

  const validateFile = (f: File): string | null => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return `不支持的文件格式，仅支持: ${ALLOWED_EXTENSIONS.join(', ')}`
    }
    if (f.size > MAX_FILE_SIZE) {
      return '文件大小超过 50MB 限制'
    }
    return null
  }

  const handleFileSelect = (f: File) => {
    const error = validateFile(f)
    if (error) {
      setValidationError(error)
      setFile(null)
      return
    }
    setValidationError(null)
    setFile(f)
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      handleFileSelect(selected)
    }
    // 重置 input 以允许重复选择同一文件
    e.target.value = ''
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await documentApi.upload(formData)
      if (result?.id) {
        setDocumentId(result.id)
        onUploadComplete()
      } else {
        setUploadError('上传失败，未获取到文档 ID')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试')
    } finally {
      setUploading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState()
    }
    onOpenChange(nextOpen)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const showProgress = uploading || documentId || uploadError

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
        </DialogHeader>

        {/* 拖拽区域 - 仅在未开始上传时显示 */}
        {!showProgress && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              )}>
              <Upload className='text-muted-foreground h-8 w-8' />
              <div className='text-center'>
                <p className='text-sm font-medium'>拖拽文件到此处，或点击选择文件</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  支持 {ALLOWED_EXTENSIONS.join(', ')} 格式，最大 50MB
                </p>
              </div>
              <input
                ref={inputRef}
                type='file'
                className='hidden'
                accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                onChange={handleInputChange}
              />
            </div>

            {/* 校验错误 */}
            {validationError && (
              <div className='flex items-center gap-2 text-sm text-red-500'>
                <XCircle className='h-4 w-4 shrink-0' />
                <span>{validationError}</span>
              </div>
            )}

            {/* 已选文件信息 */}
            {file && !validationError && (
              <div className='flex items-center gap-3 rounded-lg border p-3'>
                <FileText className='text-muted-foreground h-5 w-5 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{file.name}</p>
                  <p className='text-muted-foreground text-xs'>{formatFileSize(file.size)}</p>
                </div>
                <Button size='sm' onClick={handleUpload} disabled={uploading}>
                  上传
                </Button>
              </div>
            )}
          </>
        )}

        {/* 上传进度与状态 */}
        {showProgress && (
          <div>
            {file && (
              <div className='mb-2 flex items-center gap-3 rounded-lg border p-3'>
                <FileText className='text-muted-foreground h-5 w-5 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{file.name}</p>
                  <p className='text-muted-foreground text-xs'>{formatFileSize(file.size)}</p>
                </div>
              </div>
            )}
            <UploadProgress
              documentId={documentId}
              uploading={uploading}
              uploadError={uploadError}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
