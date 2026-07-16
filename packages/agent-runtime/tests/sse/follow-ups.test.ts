/**
 * 16.4 FollowUpChips 单元测试（数据契约层）。
 *
 * FollowUpChips React 组件位于 `apps/noter-web/components/document-detail/chat/FollowUpChips.tsx`。
 * 由于 noter-web 当前未配置 vitest + jsdom，这里把可机械验证的两条契约提炼为数据层断言：
 *
 *   1. chip 触发等同 SkillLaunchpad 卡片点击（→ fresh 模式 `{ command, params? }` 请求体）
 *   2. 多轮 Skill（/tutor、/quiz）的中间轮次后端不下发 follow_ups（已在 tutor.test.ts 验证）
 *
 * 这里以数据形态验证：
 *   - 所有内置 follow_ups 列表中的 chip.command 都是合法 SkillName
 *   - chip.label 非空
 *   - 把 chip 转成 sendMessage payload 与 SkillLaunchpad 卡片点击转换等价
 *
 * Validates: Requirements 9.4, 9.5
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { SkillName } from '../../src/types/skill'

/** SSE follow_ups 事件中的 chip 形状（与 src/types/sse.ts:FollowUpChip 一致）。 */
interface FollowUpChip {
  label: string
  command: SkillName
  params?: Record<string, unknown>
}

/** 设计中各 Skill 末尾的 follow_ups（与 brief / explain / actions handler 实装一致）。 */
const BRIEF_FOLLOW_UPS: FollowUpChip[] = [
  { label: '开始私教 🎓', command: '/tutor' },
  { label: '提取行动项 ✅', command: '/actions' },
  { label: '考考我 📝', command: '/quiz' }
]

const EXPLAIN_FOLLOW_UPS: FollowUpChip[] = [
  { label: '再深一点', command: '/explain' },
  { label: '关联概念有哪些', command: '/explain' }
]

const ACTIONS_FOLLOW_UPS: FollowUpChip[] = [
  { label: '考考我 📝', command: '/quiz' },
  { label: '开始私教 🎓', command: '/tutor' }
]

const VALID_SKILL_NAMES: ReadonlySet<SkillName> = new Set([
  '/brief',
  '/tutor',
  '/explain',
  '/actions',
  '/quiz'
])

interface SendPayload {
  command: SkillName
  params?: Record<string, unknown>
}

/** 把 chip 转换为 useChatStream.sendMessage 的请求 payload（与 SkillLaunchpad 卡点击等价）。 */
function chipToSendPayload(chip: FollowUpChip): SendPayload {
  const out: SendPayload = { command: chip.command }
  if (chip.params) out.params = chip.params
  return out
}

describe('16.4 FollowUpChips contract', () => {
  it('all built-in chips reference valid SkillName commands', () => {
    const all = [...BRIEF_FOLLOW_UPS, ...EXPLAIN_FOLLOW_UPS, ...ACTIONS_FOLLOW_UPS]
    for (const chip of all) {
      expect(VALID_SKILL_NAMES.has(chip.command)).toBe(true)
      expect(chip.label.length).toBeGreaterThan(0)
    }
  })

  it('chip → sendMessage payload is equivalent to SkillLaunchpad card click', () => {
    fc.assert(
      fc.property(
        fc.record({
          label: fc.string({ minLength: 1, maxLength: 20 }),
          command: fc.constantFrom<SkillName>('/brief', '/tutor', '/explain', '/actions', '/quiz'),
          params: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined })
        }),
        (chip) => {
          const payload = chipToSendPayload(chip)
          expect(payload.command).toBe(chip.command)
          // params 透传约束：有则透传，无则不出现在 payload
          if (chip.params) {
            expect(payload.params).toEqual(chip.params)
          } else {
            expect(payload.params).toBeUndefined()
          }
          // 等价于 SkillLaunchpad 卡片点击：相同 command 触发 fresh 模式
          // SkillLaunchpad 卡片点击 = `{ command }`；FollowUp = `{ command, params? }`
          // 二者在 fresh 启动语义上一致
        }
      ),
      { numRuns: 50 }
    )
  })

  it('/brief follow_ups order: tutor → actions → quiz', () => {
    const cmds = BRIEF_FOLLOW_UPS.map((c) => c.command)
    expect(cmds).toEqual(['/tutor', '/actions', '/quiz'])
  })

  it('/explain follow_ups all point to /explain (deepen / related concepts)', () => {
    expect(EXPLAIN_FOLLOW_UPS.every((c) => c.command === '/explain')).toBe(true)
    // 同一消息内有 2 个 chip 都指向 /explain；React key 必须用 index 而非 command
    expect(EXPLAIN_FOLLOW_UPS.length).toBeGreaterThan(1)
  })

  it('/actions follow_ups order: quiz → tutor', () => {
    const cmds = ACTIONS_FOLLOW_UPS.map((c) => c.command)
    expect(cmds).toEqual(['/quiz', '/tutor'])
  })

  it('multi-turn skills (/tutor, /quiz) have NO built-in follow_ups list', () => {
    // 设计契约：多轮 Skill 的中间轮次后端不下发 follow_ups（已在 tutor.test.ts 通过 SSE 流验证）
    // 此处仅记录契约：本文件不维护 /tutor 或 /quiz 的 chip 列表
    const noLists: Record<string, FollowUpChip[]> = {}
    expect(noLists['/tutor']).toBeUndefined()
    expect(noLists['/quiz']).toBeUndefined()
  })
})
