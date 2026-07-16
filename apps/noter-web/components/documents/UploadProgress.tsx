'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@noter/ui/components/button'
import { cn } from '@noter/ui/lib/utils'
import { documentApi } from '@/lib/axios/documents'

type StepStatus = 'pending' | 'running' | 'success' | 'failed'

interface UploadProgressProps {
  documentId: string | null
  uploading: boolean
  uploadError: string | null
}

interface ProgressState {
  parse: StepStatus
  ai: StepStatus
}

const POLL_INTERVAL = 3000
const MAX_ATTEMPTS = 100 // 5 分钟保护

// 假进度阶段上限（解析完成前最多走到 90%）
const FAKE_PROGRESS_CAP = 90
// 每 tick 推进的步长（接近 cap 时按比例放慢）
const FAKE_TICK_MS = 200

function mergeAiStatus(summary: StepStatus, mindmap: StepStatus): StepStatus {
  if (summary === 'failed' || mindmap === 'failed') return 'failed'
  if (summary === 'success' && mindmap === 'success') return 'success'
  if (summary === 'running' || mindmap === 'running') return 'running'
  if (summary === 'success' || mindmap === 'success') return 'running'
  return 'pending'
}

export default function UploadProgress({
  documentId,
  uploading,
  uploadError
}: UploadProgressProps) {
  const router = useRouter()
  const [state, setState] = useState<ProgressState>({ parse: 'pending', ai: 'pending' })
  const [pollError, setPollError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fakeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!documentId || uploading || uploadError) return

    let attempts = 0

    const poll = async () => {
      attempts += 1

      if (attempts > MAX_ATTEMPTS) {
        setState((prev) => ({
          parse: prev.parse === 'success' || prev.parse === 'failed' ? prev.parse : 'failed',
          ai: prev.ai === 'success' || prev.ai === 'failed' ? prev.ai : 'failed'
        }))
        setPollError('AI 处理超时，请稍后在文档详情页重试')
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = null
        return
      }

      try {
        const res = await documentApi.getStatus(documentId)
        if (!res) return

        const { parseStatus, summaryStatus, mindmapStatus } = res
        const parse = parseStatus as StepStatus
        const ai = mergeAiStatus(summaryStatus as StepStatus, mindmapStatus as StepStatus)

        setState({ parse, ai })

        // 解析和 AI 都终态时停止轮询
        const parseDone = parse === 'success' || parse === 'failed'
        const aiDone = ai === 'success' || ai === 'failed'
        if (parseDone && aiDone) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch {
        setPollError('状态查询失败，请刷新页面重试')
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [documentId, uploading, uploadError])

  // ===== 假进度条：持续推进到 cap，关键节点跳转 =====
  useEffect(() => {
    // 失败：进度条停在当前位置（不再推进）
    // 解析完成：停止推进，由派生值 displayProgress 渲染为 100%
    if (uploadError || state.parse === 'failed' || state.parse === 'success') {
      if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current)
      fakeIntervalRef.current = null
      return
    }

    // 上传中或解析中：缓慢逼近 cap，越接近越慢，给"在干活"的感觉
    fakeIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= FAKE_PROGRESS_CAP) return prev
        const remaining = FAKE_PROGRESS_CAP - prev
        // 每次走剩余距离的 3%，最少 +0.3，自然减速
        const step = Math.max(0.3, remaining * 0.03)
        return Math.min(FAKE_PROGRESS_CAP, prev + step)
      })
    }, FAKE_TICK_MS)

    return () => {
      if (fakeIntervalRef.current) clearInterval(fakeIntervalRef.current)
      fakeIntervalRef.current = null
    }
  }, [uploading, uploadError, state.parse])

  // ===== 主状态计算 =====
  const parseFailed = state.parse === 'failed'
  const parseReady = state.parse === 'success'
  const aiSuccess = state.ai === 'success'
  const aiFailed = state.ai === 'failed'

  // 解析完成后直接派生为 100%，避免在 effect 中同步 setState
  const displayProgress = parseReady ? 100 : progress

  // 主状态信息
  let icon: React.ReactNode
  let title: string
  let description: string | null = null
  let tone: 'progress' | 'success' | 'error' = 'progress'

  if (uploadError) {
    icon = <AlertCircle className='size-6' />
    title = '上传失败'
    description = uploadError
    tone = 'error'
  } else if (uploading) {
    icon = <Loader2 className='size-6 animate-spin' />
    title = '正在上传文件...'
  } else if (parseFailed) {
    icon = <AlertCircle className='size-6' />
    title = '解析失败'
    description = '文档无法解析，请检查文件格式后重试'
    tone = 'error'
  } else if (!parseReady) {
    icon = <Loader2 className='size-6 animate-spin' />
    title = '正在解析文档...'
    description = '解析完成后即可阅读'
  } else if (aiSuccess) {
    icon = <CheckCircle2 className='size-6' />
    title = '处理完成'
    description = 'AI 总结和思维导图已生成'
    tone = 'success'
  } else if (aiFailed) {
    icon = <CheckCircle2 className='size-6' />
    title = '文档已就绪'
    description = 'AI 总结或思维导图生成失败，可在详情页重试'
    tone = 'success'
  } else {
    icon = <CheckCircle2 className='size-6' />
    title = '文档已就绪'
    description = 'AI 总结和思维导图后台生成中...'
    tone = 'success'
  }

  const canViewDocument = documentId && parseReady && !parseFailed

  return (
    <div className='flex flex-col gap-4 py-2'>
      {/* 主状态：图标 + 文字 */}
      <div className='flex items-start gap-3'>
        <span
          className={cn(
            'mt-0.5 shrink-0',
            tone === 'success' && 'text-green-600',
            tone === 'error' && 'text-destructive',
            tone === 'progress' && 'text-primary'
          )}>
          {icon}
        </span>
        <div className='min-w-0 flex-1 space-y-0.5'>
          <p className='text-sm font-medium'>{title}</p>
          {description && <p className='text-muted-foreground text-xs'>{description}</p>}
          {pollError && <p className='text-destructive text-xs'>{pollError}</p>}
        </div>
      </div>

      {/* 进度条 */}
      <div className='bg-muted h-1 w-full overflow-hidden rounded-full'>
        <div
          className={cn(
            'h-full rounded-full transition-[width] ease-out',
            // 走到 100% 时用更短动画快速填满，制造"完成"的爽感
            displayProgress >= 100 ? 'duration-300' : 'duration-200',
            tone === 'error' ? 'bg-destructive' : 'bg-primary'
          )}
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      {/* 操作按钮 */}
      {canViewDocument && (
        <Button
          variant='outline'
          size='sm'
          className='w-full'
          onClick={() => router.push(`/documents/${documentId}`)}>
          立即查看文档
        </Button>
      )}
    </div>
  )
}
