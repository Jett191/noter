'use client'

/**
 * FollowUpChips —— 单轮 Skill 回答末尾的「下一步」chip 按钮组。
 *
 * 设计参考 `.kiro/specs/noter-agent/design.md` 与 `requirements.md`：
 *   • 数据来源：SSE `follow_ups` 事件 payload 的 `chips: FollowUpChip[]`
 *     （由 `useChatStream` 解析并挂载到末尾 assistant 消息的 `followUps`
 *     字段，参见 `apps/noter-web/components/document-detail/sse/useChatStream.ts`）。
 *   • 触发语义：点击 chip 等同 SkillLaunchpad 卡片点击（即「fresh 模式」
 *     发送 `{ command: chip.command, params?: chip.params }`）。本组件
 *     不直接拼装请求体——通过 `onPick` 回调把 chip 上抛给 caller，由
 *     caller（AIChatPanel）统一映射到 `useChatStream.sendMessage` payload，
 *     避免重复实现三入口（卡片 / 斜杠命令 / 自然语言）的请求拼装逻辑。
 *
 * 受 Requirements 9.1 ~ 9.5 约束：
 *   • 9.1 / 9.2 / 9.3 —— 单轮 Skill（/brief / /explain / /actions）末尾各自
 *     的 chip 列表由后端组装，前端只负责按收到的顺序渲染。
 *   • 9.4 —— 点击 chip 等同卡片点击（fresh 模式触发新 Skill）。
 *   • 9.5 —— 多轮 Skill（/tutor / /quiz）中间轮次后端不下发 follow_ups，
 *     因此前端 `chips` 数组为空时直接渲染 `null`，无需额外逻辑判断 Skill
 *     类型。
 *
 * UI 范围：仅在 AIChatPanel 内部渲染，不暴露到文档详情页其他区域
 * （Requirements 1.9 / Design「UI 范围约束」）。
 */

import { Button } from '@noter/ui/components/button'
import type { FollowUpChip } from '@/types/agent'

export interface FollowUpChipsProps {
  /** SSE follow_ups 事件携带的 chip 列表，按后端约定的顺序渲染 */
  chips: FollowUpChip[]
  /** chip 点击回调；caller 负责转成 sendMessage 请求体 */
  onPick: (chip: FollowUpChip) => void
}

export function FollowUpChips({ chips, onPick }: FollowUpChipsProps) {
  if (!chips || chips.length === 0) return null

  return (
    <div role='group' aria-label='下一步建议' className='flex flex-wrap gap-2 pt-1'>
      {chips.map((chip, index) => (
        <Button
          // chip 列表稳定且按 index 顺序渲染，使用 index + command 即可避免
          // 同一消息内重复 command 时的 React key 冲突（例如 /explain 末尾
          // 「再深一点 / 关联概念有哪些」两个 chip 都指向 /explain）。
          key={`${chip.command}-${index}`}
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onPick(chip)}>
          {chip.label}
        </Button>
      ))}
    </div>
  )
}
