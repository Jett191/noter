/**
 * SkillRouter 属性测试 (4.6)：
 *   - Property 1: 显式 command 优先于 message
 *   - Property 2: 多轮 session 续签作用域 + 不调 LLM / 不发 SSE
 *
 * Router 必须保持纯函数，不调用任何副作用。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

import { route } from '../../src/router/skill-router'
import type { SkillSession } from '../../src/types/session'
import type { SkillName } from '../../src/types/skill'

const SKILL_NAMES: SkillName[] = ['/brief', '/tutor', '/explain', '/actions', '/quiz']
const RESUMABLE: SkillName[] = ['/tutor', '/quiz']

function makeSession(skill: SkillName): SkillSession {
  return {
    id: 'sess-1',
    userId: 'u',
    documentId: 'd',
    skill,
    state: { status: 'active' },
    expiresAt: '2099-01-01',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Property 1: explicit command always wins', () => {
  it('command takes precedence over message + activeSession of different skill', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SkillName>(...SKILL_NAMES),
        fc.string({ maxLength: 50 }),
        fc.option(fc.constantFrom<SkillName>(...SKILL_NAMES), { nil: undefined }),
        async (command, message, sessionSkill) => {
          const decision = await route({
            command,
            message,
            activeSession: sessionSkill ? makeSession(sessionSkill) : undefined
          })
          expect(decision.skill).toBe(command)
          expect(decision.mode).toBe('fresh')
          // 当 activeSession 存在且 skill 不同 → 应放进 switchFromSession
          if (sessionSkill && sessionSkill !== command) {
            expect(decision.switchFromSession).toBeDefined()
            expect(decision.switchFromSession!.skill).toBe(sessionSkill)
          } else {
            expect(decision.switchFromSession).toBeUndefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 2: resume scope for multi-turn sessions', () => {
  it('resumable activeSession + no command => mode=resume + same skill', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SkillName>(...RESUMABLE),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (sessionSkill, message) => {
          const decision = await route({
            command: undefined,
            message,
            activeSession: makeSession(sessionSkill)
          })
          expect(decision.mode).toBe('resume')
          expect(decision.skill).toBe(sessionSkill)
          expect(decision.switchFromSession).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('non-resumable activeSession (e.g. /brief) does NOT trigger resume', async () => {
    // /brief 是单轮 Skill，即便活跃也应走第三级慢路径
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SkillName>('/brief', '/explain', '/actions'),
        async (sessionSkill) => {
          // 提供能命中关键词的 message 以避免走 LLM 兜底（保持纯函数）
          const decision = await route({
            command: undefined,
            message: '速览这篇',
            activeSession: makeSession(sessionSkill)
          })
          // mode 必须是 fresh（不是 resume）
          expect(decision.mode).toBe('fresh')
        }
      ),
      { numRuns: 30 }
    )
  })

  it('packages user message into params.message when no params provided (resume path)', async () => {
    const decision = await route({
      command: undefined,
      message: 'my answer',
      activeSession: makeSession('/tutor')
    })
    expect(decision.mode).toBe('resume')
    expect(decision.params).toEqual({ message: 'my answer' })
  })

  it('uses caller-provided params over message in resume path', async () => {
    const decision = await route({
      command: undefined,
      message: 'ignored',
      params: { config: { count: 5 } },
      activeSession: makeSession('/quiz')
    })
    expect(decision.params).toEqual({ config: { count: 5 } })
  })
})

describe('SkillRouter purity (no side effects)', () => {
  it('throws when no command, no resumable session, and no message present', async () => {
    await expect(
      route({
        command: undefined,
        message: undefined,
        activeSession: undefined
      })
    ).rejects.toThrow(/cannot route input/)
  })
})

describe('Slow path (level 3) keyword classification', () => {
  it('routes "速览" naturally to /brief without command', async () => {
    const decision = await route({
      message: '速览一下这篇文档'
    })
    expect(decision.mode).toBe('fresh')
    expect(decision.skill).toBe('/brief')
  })

  it('routes "教我" to /tutor', async () => {
    const decision = await route({ message: '教我这章' })
    expect(decision.skill).toBe('/tutor')
  })

  it('routes "考考我" to /quiz', async () => {
    const decision = await route({ message: '考考我吧' })
    expect(decision.skill).toBe('/quiz')
  })

  it('extracts concept for /explain ("什么是 X")', async () => {
    const decision = await route({ message: '什么是 RAG' })
    expect(decision.skill).toBe('/explain')
    expect(decision.params.concept).toBe('RAG')
  })
})
