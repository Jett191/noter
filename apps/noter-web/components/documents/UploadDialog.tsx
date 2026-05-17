'use client'

import { useCallback, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@noter/ui/components/dialog'
import { Button } from '@noter/ui/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@noter/ui/components/select'
import { Upload, FileText, XCircle, X, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@noter/ui/lib/utils'
import { documentApi } from '@/lib/axios/documents'
import { useFolderStore } from '@/stores/folders'
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '@/utils/feature/documents/schemas'
import UploadProgress from './UploadProgress'

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: () => void
}

interface QueueItem {
  uid: string
  file: File
  /** 仅用于上传阶段记录失败的文件名 */
  errorMessage: string | null
}

let uidSeed = 0
const nextUid = () => `f-${Date.now().toString(36)}-${(uidSeed++).toString(36)}`

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(f: File): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase()
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return `不支持的文件格式，仅支持: ${ALLOWED_EXTENSIONS.join(', ')}`
  }
  if (f.size > MAX_FILE_SIZE) {
    return '文件大小超过 50MB 限制'
  }
  return null
}

export function UploadDialog({ open, onOpenChange, onUploadComplete }: UploadDialogProps) {
  // 待上传的合法文件
  const [queue, setQueue] = useState<QueueItem[]>([])
  // 当前最近一次拖拽 / 选择产生的校验错误（仅展示一次）
  const [validationError, setValidationError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')

  // 上传阶段：单文件场景沿用原有 UploadProgress；多文件场景使用顺序上传 + 简化进度
  const [phase, setPhase] = useState<'select' | 'uploading' | 'done'>('select')
  // 单文件模式：documentId 用于驱动 UploadProgress 轮询
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // 多文件模式：进度统计
  const [progressIndex, setProgressIndex] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [failedItems, setFailedItems] = useState<{ name: string; message: string }[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const { folders } = useFolderStore()

  const resetState = useCallback(() => {
    setQueue([])
    setValidationError(null)
    setDragOver(false)
    setSelectedFolderId('')
    setPhase('select')
    setDocumentId(null)
    setUploadError(null)
    setUploading(false)
    setProgressIndex(0)
    setSuccessCount(0)
    setFailedItems([])
  }, [])

  /** 把一组 File 加入队列：校验失败的合并到 validationError，重复（同名同大小）去重 */
  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    setQueue((prev) => {
      const existing = new Set(prev.map((it) => `${it.file.name}__${it.file.size}`))
      const accepted: QueueItem[] = []
      const rejected: string[] = []
      for (const f of files) {
        const key = `${f.name}__${f.size}`
        if (existing.has(key)) continue
        existing.add(key)
        const err = validateFile(f)
        if (err) {
          rejected.push(`${f.name}：${err}`)
        } else {
          accepted.push({ uid: nextUid(), file: f, errorMessage: null })
        }
      }
      setValidationError(rejected.length > 0 ? rejected.join('；') : null)
      return [...prev, ...accepted]
    })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const dropped = Array.from(e.dataTransfer.files ?? [])
      addFiles(dropped)
    },
    [addFiles]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    addFiles(selected)
    // 重置 input 以允许重复选择同一文件
    e.target.value = ''
  }

  const removeFromQueue = (uid: string) => {
    setQueue((prev) => prev.filter((it) => it.uid !== uid))
  }

  /** 单个文件上传 API 调用，返回 documentId 或抛错 */
  const uploadOneRequest = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    if (selectedFolderId) {
      formData.append('folderId', selectedFolderId)
    }
    const result = await documentApi.upload(formData)
    if (!result?.id) throw new Error('上传失败，未获取到文档 ID')
    return result.id
  }

  /** 单文件上传：沿用原有逻辑，由 UploadProgress 轮询解析进度 */
  const handleUploadSingle = async () => {
    const file = queue[0]?.file
    if (!file) return
    setPhase('uploading')
    setUploading(true)
    setUploadError(null)
    try {
      const id = await uploadOneRequest(file)
      setDocumentId(id)
      setSuccessCount(1)
      onUploadComplete()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试')
    } finally {
      setUploading(false)
    }
  }

  /** 多文件上传：顺序调用 upload 接口，不在弹窗内逐个轮询解析（解析在后台进行） */
  const handleUploadBatch = async () => {
    setPhase('uploading')
    setProgressIndex(0)
    setSuccessCount(0)
    setFailedItems([])

    let success = 0
    const failures: { name: string; message: string }[] = []
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      setProgressIndex(i + 1)
      try {
        await uploadOneRequest(item.file)
        success += 1
        setSuccessCount(success)
        // 每成功一个就刷新列表，让用户能立刻在外面看到
        onUploadComplete()
      } catch (err) {
        failures.push({
          name: item.file.name,
          message: err instanceof Error ? err.message : '上传失败'
        })
        setFailedItems([...failures])
      }
    }
    setPhase('done')
  }

  const handleUpload = () => {
    if (queue.length === 1) {
      handleUploadSingle()
    } else if (queue.length > 1) {
      handleUploadBatch()
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    // 上传中不允许关闭，避免请求被打断
    if (!nextOpen && (uploading || phase === 'uploading')) return
    if (!nextOpen) {
      resetState()
    }
    onOpenChange(nextOpen)
  }

  // ====== 渲染分支 ======

  // 1) 单文件模式且已开始上传：保留原有 UploadProgress UI
  const showSingleProgress = queue.length <= 1 && (uploading || documentId || uploadError)

  // 2) 多文件批量上传中：紧凑的总体进度
  const showBatchProgress = phase === 'uploading' && queue.length > 1
  // 3) 多文件上传完成：结果汇总
  const showBatchDone = phase === 'done' && queue.length > 1

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
        </DialogHeader>

        {/* === 选择阶段 === */}
        {phase === 'select' && !showSingleProgress && (
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
                  支持 {ALLOWED_EXTENSIONS.join(', ')} 格式，最大 50MB · 支持多文件
                </p>
              </div>
              <input
                ref={inputRef}
                type='file'
                multiple
                className='hidden'
                accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
                onChange={handleInputChange}
              />
            </div>

            {/* 校验错误（最近一次） */}
            {validationError && (
              <div className='flex items-start gap-2 text-sm text-red-500'>
                <XCircle className='mt-0.5 h-4 w-4 shrink-0' />
                <span className='break-words'>{validationError}</span>
              </div>
            )}

            {/* 已选文件列表 */}
            {queue.length > 0 && (
              <div className='space-y-3'>
                <div className='max-h-48 space-y-2 overflow-y-auto'>
                  {queue.map((item) => (
                    <div key={item.uid} className='flex items-center gap-3 rounded-lg border p-3'>
                      <FileText className='text-muted-foreground h-5 w-5 shrink-0' />
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium' title={item.file.name}>
                          {item.file.name}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                          {formatFileSize(item.file.size)}
                        </p>
                      </div>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0'
                        onClick={() => removeFromQueue(item.uid)}
                        aria-label='移除文件'>
                        <X className='h-4 w-4' />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* 文件夹选择 */}
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>保存到：</span>
                  <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                    <SelectTrigger className='h-8 flex-1 text-xs'>
                      <SelectValue placeholder='最近（默认）' />
                    </SelectTrigger>
                    <SelectContent>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button size='sm' className='w-full' onClick={handleUpload}>
                  {queue.length > 1 ? `上传 ${queue.length} 个文件` : '上传'}
                </Button>
              </div>
            )}
          </>
        )}

        {/* === 单文件上传进度（沿用原有 UploadProgress 组件 + 文件信息卡） === */}
        {showSingleProgress && queue[0] && (
          <div>
            <div className='mb-2 flex items-center gap-3 rounded-lg border p-3'>
              <FileText className='text-muted-foreground h-5 w-5 shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>{queue[0].file.name}</p>
                <p className='text-muted-foreground text-xs'>
                  {formatFileSize(queue[0].file.size)}
                </p>
              </div>
            </div>
            <UploadProgress
              documentId={documentId}
              uploading={uploading}
              uploadError={uploadError}
            />
          </div>
        )}

        {/* === 多文件批量上传中 === */}
        {showBatchProgress && (
          <div className='flex flex-col gap-3 py-2'>
            <div className='flex items-start gap-3'>
              <Loader2 className='text-primary mt-0.5 size-6 shrink-0 animate-spin' />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium'>
                  正在上传 {progressIndex} / {queue.length}
                </p>
                <p className='text-muted-foreground truncate text-xs'>
                  {queue[progressIndex - 1]?.file.name}
                </p>
              </div>
            </div>
            <div className='bg-muted h-1 w-full overflow-hidden rounded-full'>
              <div
                className='bg-primary h-full rounded-full transition-[width] duration-200 ease-out'
                style={{ width: `${(progressIndex / queue.length) * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              上传完成后文档会在后台自动解析，可关闭此窗口继续操作。
            </p>
          </div>
        )}

        {/* === 多文件上传完成 === */}
        {showBatchDone && (
          <div className='flex flex-col gap-3 py-2'>
            <div className='flex items-start gap-3'>
              <CheckCircle2
                className={cn(
                  'mt-0.5 size-6 shrink-0',
                  failedItems.length === 0 ? 'text-green-600' : 'text-amber-500'
                )}
              />
              <div className='min-w-0 flex-1 space-y-0.5'>
                <p className='text-sm font-medium'>
                  已提交 {successCount} / {queue.length} 个文档
                </p>
                <p className='text-muted-foreground text-xs'>
                  文档正在后台解析，稍后可在列表中查看处理状态。
                </p>
              </div>
            </div>

            {failedItems.length > 0 && (
              <div className='border-destructive/30 bg-destructive/5 max-h-32 overflow-y-auto rounded-lg border p-3'>
                <p className='text-destructive mb-1 text-xs font-medium'>以下文件上传失败：</p>
                <ul className='text-destructive space-y-0.5 text-xs'>
                  {failedItems.map((f, i) => (
                    <li key={i} className='truncate' title={`${f.name}：${f.message}`}>
                      · {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button size='sm' className='w-full' onClick={() => handleOpenChange(false)}>
              完成
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
