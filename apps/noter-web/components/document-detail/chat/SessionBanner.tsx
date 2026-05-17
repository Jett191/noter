'use client'

/**
 * SessionBanner —— 多轮 Skill（`/tutor` / `/quiz`）状态栏。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` → Frontend Interaction Design 中
 * 「SessionBanner（多轮 Skill 状态栏）」与「输入框 placeholder 联动」段落。
 *
 * 核心行为：
 *   • 订阅 chatSessionStore 的 activeSession；activeSession === null 时不渲染。
 *   • 文案规则：
 *       - `/tutor` (status='active', progress 必有) → 「🎓 私教进行中 第 X/Y 章」
 *       - `/quiz` (status='active', 无 progress)   → 「📝 测验配置中」（configuring 阶段
 *         由后端 quiz.ts:runConfiguringPhase 发出，不带 progress）
 *       - `/quiz` (status='active', 有 progress)   → 「📝 测验进行中 X/Y」（answering 阶段
 *         由后端 quiz.ts:runAnsweringPhase 发出，progress 表达 answered/total）
 *     `status='ended' | 'interrupted'` 时 store 已清空 activeSession，banner 自动隐藏。
 *   • 退出按钮：弹 AlertDialog 二次确认 → 调用 `aiApi.endSession(activeSession.id)` →
 *     `chatSession.resetForLaunchpad()`；调用失败时通过 alert 提示，session 状态保持
 *     不变（与 DocumentCardMenu 错误处理风格一致；项目目前未引入 sonner toast）。
 *   • activeSession.id 不存在时（如 `/tutor` 启动首轮 banner 还未拿到 sessionId 的边界）
 *     退出按钮 disabled，避免 PATCH 一个 undefined sessionId。
 *   • 固定在消息列表顶部（不随消息滚动）：组件本身只描述 banner 外观与交互，由
 *     AIChatPanel 在消息 ScrollArea 之外渲染以达成「不随消息滚动」的视觉效果。
 */

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@noter/ui/components/alert-dialog'
import { LogOut } from 'lucide-react'
import { cn } from '@noter/ui/lib/utils'

import { useChatSessionStore, type ActiveSession } from '@/stores/chatSession'
import { aiApi } from '@/lib/axios/ai'

interface BannerCopy {
  /** 左侧 emoji + 文案前缀，例如「🎓 私教进行中」 */
  prefix: string
  /** 右侧进度文本，缺省时表示无进度展示（如 quiz configuring） */
  progressText?: string
}

/**
 * 根据 activeSession 决定 banner 文案。
 *
 * 注意：store 中 ActiveSession.status 收紧为 'active'（'ended' / 'interrupted' 在
 * applySessionBanner 中即清空 activeSession），因此此处不需要再分支处理这两种状态。
 */
function getBannerCopy(session: ActiveSession): BannerCopy | null {
  if (session.skill === '/tutor') {
    if (!session.progress) {
      // /tutor 进度缺失视为异常态，保守不展示进度
      return { prefix: '🎓 私教进行中' }
    }
    return {
      prefix: '🎓 私教进行中',
      progressText: `第 ${session.progress.current}/${session.progress.total} 章`
    }
  }

  if (session.skill === '/quiz') {
    // configuring 阶段后端只发 banner、不带 progress；answering 阶段带 progress
    if (!session.progress) {
      return { prefix: '📝 测验配置中' }
    }
    return {
      prefix: '📝 测验进行中',
      progressText: `${session.progress.current}/${session.progress.total}`
    }
  }

  // 其它 Skill 不应进入 activeSession（store 仅记录多轮 Skill），保守 fallback
  return null
}

interface SessionBannerProps {
  /** 允许调用方覆盖容器布局类，例如在 AIChatPanel 中固定 sticky 顶部 */
  className?: string
}

export function SessionBanner({ className }: SessionBannerProps) {
  const activeSession = useChatSessionStore((s) => s.activeSession)
  const resetForLaunchpad = useChatSessionStore((s) => s.resetForLaunchpad)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exiting, setExiting] = useState(false)

  if (!activeSession) {
    return null
  }

  const copy = getBannerCopy(activeSession)
  if (!copy) {
    return null
  }

  // sessionId 缺失时（/tutor 启动首轮 banner 还未带 sessionId 的边界）禁用退出，
  // 避免 PATCH 到 /api/ai/sessions/undefined。
  const exitDisabled = !activeSession.id || exiting

  const handleConfirmExit = async () => {
    if (!activeSession.id) return
    setExiting(true)
    try {
      await aiApi.endSession(activeSession.id)
      resetForLaunchpad()
      setConfirmOpen(false)
    } catch (err) {
      console.error('[SessionBanner] endSession failed', err)
      // 项目暂未引入 sonner toast，沿用 DocumentCardMenu 的 alert 提示风格。
      alert(err instanceof Error ? err.message : '退出会话失败')
    } finally {
      setExiting(false)
    }
  }

  return (
    <>
      <div
        data-slot='session-banner'
        className={cn(
          'bg-muted/60 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm',
          className
        )}
        role='status'
        aria-live='polite'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='font-medium'>{copy.prefix}</span>
          {copy.progressText ? (
            <span className='text-muted-foreground truncate'>{copy.progressText}</span>
          ) : null}
        </div>
        <Button
          variant='ghost'
          size='sm'
          disabled={exitDisabled}
          onClick={() => setConfirmOpen(true)}
          aria-label='退出当前会话'>
          <LogOut data-icon='inline-start' />
          退出
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出当前会话？</AlertDialogTitle>
            <AlertDialogDescription>
              退出后当前进度将结束，消息列表会重置回启动面板。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exiting}>取消</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={handleConfirmExit} disabled={exiting}>
              {exiting ? '退出中...' : '确认退出'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
