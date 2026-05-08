'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { documentApi } from '@/lib/axios/documents'

/** 处理阶段定义 */
const STEPS = [
  { key: 'upload', label: '上传完成' },
  { key: 'parse', label: '解析中' },
  { key: 'vector', label: '向量化中' },
  { key: 'ai', label: 'AI 生成中' },
  { key: 'ready', label: '完成' }
] as const

type StepStatus = 'pending' | 'running' | 'success' | 'failed'

type StepKey = 'upload' | 'parse' | 'vector' | 'ai' | 'ready'

type StepStatuses = Record<StepKey, StepStatus>

interface UploadProgressProps {
  documentId: string | null
  uploading: boolean
  uploadError: string | null
}

export default function UploadProgress({
  documentId,
  uploading,
  uploadError
}: UploadProgressProps) {
  const [stepStatuses, setStepStatuses] = useState<StepStatuses>({
    upload: 'pending',
    parse: 'pending',
    vector: 'pending',
    ai: 'pending',
    ready: 'pending'
  })
  const [pollError, setPollError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 上传阶段状态
  useEffect(() => {
    if (uploading) {
      setStepStatuses((prev) => ({ ...prev, upload: 'running' }))
    } else if (uploadError) {
      setStepStatuses((prev) => ({ ...prev, upload: 'failed' }))
    } else if (documentId) {
      setStepStatuses((prev) => ({ ...prev, upload: 'success' }))
    }
  }, [uploading, uploadError, documentId])

  // 上传成功后轮询状态
  useEffect(() => {
    if (!documentId || uploading || uploadError) return

    const poll = async () => {
      try {
        const res = await documentApi.getStatus(documentId)
        if (!res) return

        const { status, parseStatus, vectorStatus, summaryStatus, mindmapStatus } = res

        setStepStatuses((prev) => {
          const next: StepStatuses = { ...prev, upload: 'success' }

          // 解析阶段
          if (parseStatus === 'running') next.parse = 'running'
          else if (parseStatus === 'success') next.parse = 'success'
          else if (parseStatus === 'failed') next.parse = 'failed'
          else next.parse = 'pending'

          // 向量化阶段
          if (vectorStatus === 'running') next.vector = 'running'
          else if (vectorStatus === 'success') next.vector = 'success'
          else if (vectorStatus === 'failed') next.vector = 'failed'
          else next.vector = 'pending'

          // AI 生成阶段（summary + mindmap 合并展示）
          if (summaryStatus === 'failed' || mindmapStatus === 'failed') {
            next.ai = 'failed'
          } else if (summaryStatus === 'running' || mindmapStatus === 'running') {
            next.ai = 'running'
          } else if (summaryStatus === 'success' && mindmapStatus === 'success') {
            next.ai = 'success'
          } else if (summaryStatus === 'success' || mindmapStatus === 'success') {
            next.ai = 'running'
          } else {
            next.ai = 'pending'
          }

          // 整体完成
          if (status === 'ready') {
            next.ready = 'success'
          } else if (status === 'failed') {
            next.ready = 'failed'
          } else {
            next.ready = 'pending'
          }

          return next
        })

        // 终止轮询条件
        if (status === 'ready' || status === 'failed') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch {
        setPollError('状态查询失败，请刷新页面重试')
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    // 立即执行一次
    poll()
    intervalRef.current = setInterval(poll, 3000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [documentId, uploading, uploadError])

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className='h-4 w-4 text-green-500' />
      case 'running':
        return <Loader2 className='h-4 w-4 animate-spin text-blue-500' />
      case 'failed':
        return <XCircle className='h-4 w-4 text-red-500' />
      default:
        return <div className='border-muted-foreground/30 h-4 w-4 rounded-full border-2' />
    }
  }

  const overallFailed = stepStatuses.ready === 'failed' || uploadError
  const overallSuccess = stepStatuses.ready === 'success'

  return (
    <div className='mt-4 space-y-3'>
      {/* 步骤列表 */}
      <div className='space-y-2'>
        {STEPS.map((step) => (
          <div key={step.key} className='flex items-center gap-2 text-sm'>
            {getStepIcon(stepStatuses[step.key])}
            <span
              className={
                stepStatuses[step.key] === 'running'
                  ? 'text-foreground font-medium'
                  : stepStatuses[step.key] === 'success'
                    ? 'text-muted-foreground'
                    : stepStatuses[step.key] === 'failed'
                      ? 'text-red-500'
                      : 'text-muted-foreground/60'
              }>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* 结果提示 */}
      {overallSuccess && (
        <p className='text-sm font-medium text-green-600'>文档处理完成，可以开始阅读了！</p>
      )}
      {overallFailed && !uploadError && (
        <p className='text-sm text-red-500'>文档处理失败，请稍后重试或联系管理员。</p>
      )}
      {uploadError && <p className='text-sm text-red-500'>{uploadError}</p>}
      {pollError && <p className='text-sm text-red-500'>{pollError}</p>}
    </div>
  )
}
