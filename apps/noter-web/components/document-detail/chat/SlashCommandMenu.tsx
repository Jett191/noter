'use client'

/**
 * SlashCommandMenu —— 输入框首字符为 `/` 时弹出的斜杠命令浮层。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` 与 `requirements.md` 需求 2.2-2.7。
 *
 * 任务 12.1 关键约定：
 *   • 触发：caller（AIChatPanel）检测输入框首字符为 `/` → 设 open=true。
 *   • 位置：caller 在输入框外层放 position-relative 容器，本组件以 absolute
 *     `bottom-full inset-x-0` 渲染在输入框正上方。**不**用 portal、**不**用
 *     getBoundingClientRect；保持纯 div + tailwind，避免 layout 抖动。
 *   • 内容：列出 5 个 Skill 的 name / label / description / requiresParams 标志。
 *   • 键盘操作（window 级监听，仅在 open=true 时挂载）：
 *       - ArrowUp / ArrowDown → 切换 focusedIndex（环绕）
 *       - Enter               → 调用 onPick(focusedSkill)
 *       - Esc                 → 调用 onClose()，**不**修改输入框内容
 *   • requiresParams=true：caller 负责把光标停在命令尾部等待参数（仅 UI 行为，
 *     本组件不修改输入框文本，只通过 onPick 回调把选中的 SkillName 传给 caller，
 *     由 caller 拼接 command + 关闭浮层 + 控制光标）。
 *
 * 数据来源：本期前端 SkillRegistry 镜像后端
 * `packages/agent-runtime/src/skills/registry.ts` 中的 5 条 manifest。后端 runtime
 * 模块包含 Supabase / LLM 等服务端依赖、不适合在 client component 中直接 import；
 * 与 `SkillLaunchpad.tsx` 保持一致的镜像策略，任何字段调整都需要前后端同步修改
 * （registry.ts、SkillLaunchpad.tsx 与本文件）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Badge } from '@noter/ui/components/badge'
import { cn } from '@noter/ui/lib/utils'
import type { SkillManifest, SkillName } from '@/types/agent'

/**
 * 与 `packages/agent-runtime/src/skills/registry.ts` 完全一致的镜像。
 *
 * **不要**就地排序 / 修改本数组——`useMemo` 内会按 launchpadPriority 升序产出
 * 视图列表；保持源数据稳定有利于排查 priority 调整带来的视觉差异。
 */
const SKILL_MANIFESTS: readonly SkillManifest[] = [
  {
    name: '/brief',
    label: '速览这篇',
    description: '30 秒掌握文档骨架、核心主张与推荐阅读路径，零冷启动入门。',
    multiTurn: false,
    launchpadPriority: 1,
    launchpadIcon: '📖',
    launchpadTagline: '30 秒掌握全文骨架',
    requiresParams: false
  },
  {
    name: '/tutor',
    label: '章节私教',
    description: 'AI 私教带你逐章精读，每章先讲核心、再以提问检验理解。',
    multiTurn: true,
    launchpadPriority: 2,
    launchpadIcon: '🎓',
    launchpadTagline: '逐章带读,稳扎稳打',
    requiresParams: false
  },
  {
    name: '/quiz',
    label: '考考我',
    description: '基于本文生成测验题,单选 / 多选 / 填空 / 简答任选,检验掌握度。',
    multiTurn: true,
    launchpadPriority: 3,
    launchpadIcon: '📝',
    launchpadTagline: '出题检验掌握度',
    requiresParams: false
  },
  {
    name: '/actions',
    label: '行动项提取',
    description: '读完这篇该做什么:提取行动项、待学概念与延伸阅读建议。',
    multiTurn: false,
    launchpadPriority: 4,
    launchpadIcon: '✅',
    launchpadTagline: '读完这篇该做什么',
    requiresParams: false
  },
  {
    name: '/explain',
    label: '解释概念',
    description: '指定一个概念,结合本文相关位置给出清晰定义与引用。',
    multiTurn: false,
    launchpadPriority: 5,
    launchpadIcon: '💡',
    launchpadTagline: '指定概念深度释疑',
    requiresParams: true
  }
]

export interface SlashCommandMenuProps {
  /** 是否展开浮层；caller 在 input 首字符为 `/` 时置 true，选中或 Esc 后置 false */
  open: boolean
  /**
   * 选中某项时回调；caller 负责：
   *   1. 把 `<skill> ` 拼回输入框文本
   *   2. 关闭浮层（外部把 open 置 false）
   *   3. 当对应 manifest.requiresParams=true 时把光标停在命令尾部等待参数
   *
   * 本组件**不**修改输入框文本、**不**直接控制 caller 的 open 状态——避免
   * 与 caller 已有的输入框状态机产生竞态。
   */
  onPick: (skill: SkillName) => void
  /**
   * 用户按 Esc 时回调；caller 收到后应：
   *   1. 把 open 置 false
   *   2. 保留输入框现有内容(不修改)
   */
  onClose: () => void
  /**
   * 输入框 ref。当前用于:
   *   1. window 级 keydown 监听时,仅当焦点位于 anchor 上时才响应方向键 / Enter / Esc,
   *      避免抢占其他 input(例如 chat 历史中的 textarea)的快捷键。
   *   2. Esc 关闭后由 caller 自然保持焦点;本组件不主动 focus / blur anchor。
   *
   * 缺省时退化为「open 时拦截全 window keydown」。
   */
  anchorRef?: RefObject<HTMLElement | null>
  /** 可选额外类名(外层浮层容器) */
  className?: string
}

/**
 * 内部行项组件;独立出来主要是为了 ref 能精准定位到聚焦项,
 * 用 scrollIntoView 避免方向键移动到屏幕外。
 */
function SkillRow({
  manifest,
  focused,
  onSelect,
  onHover,
  rowRef
}: {
  manifest: SkillManifest
  focused: boolean
  onSelect: () => void
  onHover: () => void
  rowRef: (el: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={rowRef}
      type='button'
      role='option'
      aria-selected={focused}
      tabIndex={-1}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        // 用 mousedown 而不是 click,避免 input 失焦后再触发 click 时
        // caller 已经因为 blur 把 open 置 false 而错过本次选择。
        e.preventDefault()
        onSelect()
      }}
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left',
        'transition-colors',
        focused ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60'
      )}>
      <span aria-hidden='true' className='shrink-0 text-lg leading-none select-none'>
        {manifest.launchpadIcon}
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex items-center gap-2'>
          <code className='text-foreground bg-muted/60 rounded px-1 py-0.5 font-mono text-xs'>
            {manifest.name}
          </code>
          <span className='truncate text-sm font-medium'>{manifest.label}</span>
          {manifest.requiresParams && (
            <Badge variant='outline' className='shrink-0 px-1.5 py-0 text-[10px]'>
              需参数
            </Badge>
          )}
        </div>
        <p className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
          {manifest.description}
        </p>
      </div>
    </button>
  )
}

export function SlashCommandMenu({
  open,
  onPick,
  onClose,
  anchorRef,
  className
}: SlashCommandMenuProps) {
  /** 当前聚焦项索引;打开时重置为 0,关闭时不动以避免闪烁 */
  const [focusedIndex, setFocusedIndex] = useState(0)

  /** 各行的 DOM 引用,用于聚焦项移出可视区时 scrollIntoView */
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  /** 按 launchpadPriority 升序的 manifest 列表(全量 5 条) */
  const skills = useMemo(
    () => [...SKILL_MANIFESTS].sort((a, b) => a.launchpadPriority - b.launchpadPriority),
    []
  )

  /** open 切换为 true 时把 focusedIndex 重置回 0,确保用户每次唤起都从头开始 */
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedIndex(0)
    }
  }, [open])

  /**
   * 判断当前 keydown 是否应该被本组件消费。
   *
   * 当 anchorRef 存在时:仅当焦点位于 anchor 上时才响应,避免抢占其他输入框的
   * 方向键。anchorRef 缺失时:任何键都消费(降级)。
   */
  const shouldHandleKey = useCallback(
    (target: EventTarget | null): boolean => {
      if (!anchorRef?.current) return true
      return target === anchorRef.current
    },
    [anchorRef]
  )

  /** window 级 keydown 监听,仅在 open=true 时挂载 */
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleKey(e.target)) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => (i + 1) % skills.length)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => (i - 1 + skills.length) % skills.length)
        return
      }

      if (e.key === 'Enter') {
        // 防止默认 Enter 行为(例如表单 submit)和向下游传播去触发 caller 的发送逻辑;
        // 本浮层打开期间,Enter 的语义只能是「选中当前聚焦项」。
        e.preventDefault()
        e.stopPropagation()
        const target = skills[focusedIndex]
        if (target) {
          onPick(target.name)
        }
        return
      }

      if (e.key === 'Escape') {
        // 仅关闭浮层;不修改 caller 输入框内容(由 caller 决定是否清掉 `/`)
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
    }

    // 用 capture=true 拦截在浮层 / 输入框冒泡到上层之前;Esc / Enter 才能稳定吃住。
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [open, focusedIndex, skills, shouldHandleKey, onPick, onClose])

  /** 聚焦项切换时滚入可视区,避免方向键把聚焦项移出 max-h 容器 */
  useEffect(() => {
    if (!open) return
    const el = rowRefs.current[focusedIndex]
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [open, focusedIndex])

  if (!open) return null

  return (
    <div
      role='listbox'
      aria-label='斜杠命令菜单'
      className={cn(
        // 绝对定位在 caller 提供的 position-relative 容器中,渲染在输入框正上方
        'absolute inset-x-0 bottom-full z-30 mb-2',
        // 浮层视觉:沿用 shadcn popover 风格(bg-popover + ring + shadow)
        'bg-popover text-popover-foreground ring-foreground/10',
        'flex max-h-72 flex-col overflow-y-auto rounded-md p-1 shadow-lg ring-1',
        // 进入动画:轻微上移淡入
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-100',
        className
      )}>
      <div className='border-b px-3 pt-1.5 pb-2'>
        <p className='text-muted-foreground text-[11px]'>↑↓ 选择 · Enter 确认 · Esc 关闭</p>
      </div>
      <div className='flex flex-col gap-0.5 p-1'>
        {skills.map((manifest, index) => (
          <SkillRow
            key={manifest.name}
            manifest={manifest}
            focused={index === focusedIndex}
            onSelect={() => onPick(manifest.name)}
            onHover={() => setFocusedIndex(index)}
            rowRef={(el) => {
              rowRefs.current[index] = el
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default SlashCommandMenu
