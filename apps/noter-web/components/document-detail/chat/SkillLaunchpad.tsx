'use client'

/**
 * SkillLaunchpad —— 文档对话面板的零冷启动入口。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` 与 `requirements.md` 需求 1。
 *
 * 自适应规则（任务 11.3）：
 *   • normal → 取 launchpadPriority 最小的 3 张主推卡 + 「更多 ▾」展开剩余 2 张
 *   • tall   → 单列 5 张
 *   • wide   → 双列 3+2 网格（首行 3 张、次行 2 张居中）共 5 张
 *
 * 三入口同源（需求 2.1）：点击卡片等价于在输入框输入对应斜杠命令后回车，
 * 由父组件通过 `onPickSkill(skill)` 收敛为统一的 `{ command: <SkillName> }` 请求体。
 *
 * 数据来源：本期前端 SkillRegistry 镜像后端 `packages/agent-runtime/src/skills/registry.ts`
 * 中的 5 条 manifest。后端运行时模块包含 Supabase / LLM 等服务端依赖、不适合在
 * client component 中直接 import；将 manifest 列表显式镜像在此文件内即可，
 * 任何字段调整都需要前后端同步修改（registry.ts 与本文件）。
 */

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@noter/ui/components/card'
import { Button } from '@noter/ui/components/button'
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
    launchpadTagline: '逐章带读，稳扎稳打',
    requiresParams: false
  },
  {
    name: '/quiz',
    label: '考考我',
    description: '基于本文生成测验题，单选 / 多选 / 填空 / 简答任选，检验掌握度。',
    multiTurn: true,
    launchpadPriority: 3,
    launchpadIcon: '📝',
    launchpadTagline: '出题检验掌握度',
    requiresParams: false
  },
  {
    name: '/actions',
    label: '行动项提取',
    description: '读完这篇该做什么：提取行动项、待学概念与延伸阅读建议。',
    multiTurn: false,
    launchpadPriority: 4,
    launchpadIcon: '✅',
    launchpadTagline: '读完这篇该做什么',
    requiresParams: false
  },
  {
    name: '/explain',
    label: '解释概念',
    description: '指定一个概念，结合本文相关位置给出清晰定义与引用。',
    multiTurn: false,
    launchpadPriority: 5,
    launchpadIcon: '💡',
    launchpadTagline: '指定概念深度释疑',
    requiresParams: true
  }
]

export type SkillLaunchpadSize = 'normal' | 'tall' | 'wide'

export interface SkillLaunchpadProps {
  /** 父级 AIChatPanel 当前尺寸；驱动主推数量与栅格布局 */
  size: SkillLaunchpadSize
  /** 点击卡片回调；父级负责收敛为 `{ command: <SkillName> }` SSE 请求体 */
  onPickSkill: (skill: SkillName) => void
  /** 可选额外类名（外层容器） */
  className?: string
}

/** 单张 Skill 卡片（按钮形态，键盘可达） */
function SkillCard({
  manifest,
  onClick,
  layout
}: {
  manifest: SkillManifest
  onClick: () => void
  /** 控制卡片排版：`row` 横排（icon 左 / 文案右）；`stack` 纵排（icon 顶 / 文案底） */
  layout: 'row' | 'stack'
}) {
  return (
    <Card
      role='button'
      tabIndex={0}
      size='sm'
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      aria-label={`${manifest.label}：${manifest.launchpadTagline}`}
      className={cn(
        'hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-ring/40 cursor-pointer transition-colors',
        'focus:outline-none focus-visible:ring-2'
      )}>
      <CardHeader
        className={cn(
          'gap-1',
          layout === 'row' ? 'flex flex-row items-start gap-3' : 'flex flex-col items-start'
        )}>
        <span
          aria-hidden='true'
          className={cn(
            'flex shrink-0 items-center justify-center text-2xl leading-none select-none',
            layout === 'stack' && 'mb-1'
          )}>
          {manifest.launchpadIcon}
        </span>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <CardTitle className='truncate'>{manifest.label}</CardTitle>
          <CardDescription className='line-clamp-2 text-xs leading-relaxed'>
            {manifest.launchpadTagline}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

export function SkillLaunchpad({ size, onPickSkill, className }: SkillLaunchpadProps) {
  /** normal 尺寸下「更多 ▾」是否已展开 */
  const [moreOpen, setMoreOpen] = useState(false)

  /** 按 launchpadPriority 升序的全量 manifest（5 张） */
  const orderedSkills = useMemo(
    () => [...SKILL_MANIFESTS].sort((a, b) => a.launchpadPriority - b.launchpadPriority),
    []
  )

  /** normal: 主推 3 张（priority 最小）；tall / wide: 全量 5 张 */
  const primarySkills = size === 'normal' ? orderedSkills.slice(0, 3) : orderedSkills
  const moreSkills = size === 'normal' ? orderedSkills.slice(3) : []

  const handlePick = (skill: SkillName) => {
    onPickSkill(skill)
  }

  return (
    <div
      className={cn('flex w-full flex-col gap-3', className)}
      aria-label='选择一个 Skill 开启对话'>
      <div className='flex flex-col gap-1'>
        <h3 className='text-foreground text-sm font-medium'>选一个 Skill 开始</h3>
        <p className='text-muted-foreground text-xs'>
          点击卡片即可触发对应斜杠命令，也可以在输入框中直接输入 / 唤起命令菜单。
        </p>
      </div>

      {/* 主推卡片栅格 */}
      {size === 'tall' && (
        <div className='flex flex-col gap-2'>
          {primarySkills.map((manifest) => (
            <SkillCard
              key={manifest.name}
              manifest={manifest}
              layout='row'
              onClick={() => handlePick(manifest.name)}
            />
          ))}
        </div>
      )}

      {size === 'wide' && (
        <div className='flex flex-col gap-2'>
          <div className='grid grid-cols-3 gap-2'>
            {primarySkills.slice(0, 3).map((manifest) => (
              <SkillCard
                key={manifest.name}
                manifest={manifest}
                layout='stack'
                onClick={() => handlePick(manifest.name)}
              />
            ))}
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {primarySkills.slice(3).map((manifest) => (
              <SkillCard
                key={manifest.name}
                manifest={manifest}
                layout='row'
                onClick={() => handlePick(manifest.name)}
              />
            ))}
          </div>
        </div>
      )}

      {size === 'normal' && (
        <>
          <div className='grid grid-cols-3 gap-2'>
            {primarySkills.map((manifest) => (
              <SkillCard
                key={manifest.name}
                manifest={manifest}
                layout='stack'
                onClick={() => handlePick(manifest.name)}
              />
            ))}
          </div>

          {moreSkills.length > 0 && (
            <div className='flex flex-col gap-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls='skill-launchpad-more'
                className='text-muted-foreground hover:text-foreground gap-1 self-start px-2'>
                {moreOpen ? '收起' : '更多'}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-150',
                    moreOpen && 'rotate-180'
                  )}
                  aria-hidden='true'
                />
              </Button>
              {moreOpen && (
                <div
                  id='skill-launchpad-more'
                  className='grid grid-cols-2 gap-2'
                  role='group'
                  aria-label='更多 Skill'>
                  {moreSkills.map((manifest) => (
                    <SkillCard
                      key={manifest.name}
                      manifest={manifest}
                      layout='row'
                      onClick={() => handlePick(manifest.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SkillLaunchpad
