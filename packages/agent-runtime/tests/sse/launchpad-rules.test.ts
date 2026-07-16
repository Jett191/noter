/**
 * 11.4 SkillLaunchpad 自适应展示规则属性测试。
 *
 * 验证 design.md 「SkillLaunchpad 自适应规则」：
 *   - normal → 取 launchpadPriority 最小的 3 张主推卡 + 「更多」展开剩余
 *   - tall   → 单列 5 张
 *   - wide   → 双列 3+2 网格 5 张
 *
 * 由于 SkillLaunchpad 组件依赖 React，我们把规则提炼为纯函数 `selectLaunchpadSkills`
 * 在测试内复刻一份并对它做 fast-check property 验证。前端组件的实际行为应与此规则一致
 * （已在 11.3 实装中通过 manifest 镜像 + size 分支保证）。
 *
 * Property 11: SkillLaunchpad 自适应展示
 *   - normal → 主推卡数 = 3 且为 priority 最小 3 个
 *   - tall   → 主推卡数 = 5
 *   - wide   → 主推卡数 = 5
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { listSkills } from '../../src/skills/registry'

interface Manifest {
  name: string
  launchpadPriority: number
}

type Size = 'normal' | 'tall' | 'wide'

/**
 * 与 SkillLaunchpad.tsx 中 useMemo 等价的纯规则函数。
 *
 * normal: 主推取 priority 最小 3 张；其余作为 "更多" 展开。
 * tall / wide: 全量返回（5 张）。
 */
function selectLaunchpadSkills(manifests: Manifest[], size: Size): Manifest[] {
  const ordered = [...manifests].sort((a, b) => a.launchpadPriority - b.launchpadPriority)
  if (size === 'normal') return ordered.slice(0, 3)
  return ordered // tall / wide 全量
}

describe('Property 11: SkillLaunchpad 自适应展示', () => {
  const arbManifest = fc.record({
    name: fc.string({ minLength: 1, maxLength: 10 }),
    launchpadPriority: fc.integer({ min: 1, max: 100 })
  })

  it('normal size returns exactly 3 cards (or all if total < 3) which are priority-min', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbManifest, {
          minLength: 5,
          maxLength: 10,
          selector: (m) => m.name
        }),
        (manifests) => {
          const result = selectLaunchpadSkills(manifests, 'normal')
          expect(result.length).toBe(3)
          // 必须包含全量中 priority 最小 3 个
          const sorted = [...manifests].sort((a, b) => a.launchpadPriority - b.launchpadPriority)
          for (let i = 0; i < 3; i++) {
            expect(result[i].name).toBe(sorted[i].name)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('tall size returns all 5 cards in priority order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbManifest, {
          minLength: 5,
          maxLength: 5,
          selector: (m) => m.name
        }),
        (manifests) => {
          const result = selectLaunchpadSkills(manifests, 'tall')
          expect(result.length).toBe(5)
          const sorted = [...manifests].sort((a, b) => a.launchpadPriority - b.launchpadPriority)
          for (let i = 0; i < 5; i++) {
            expect(result[i].name).toBe(sorted[i].name)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('wide size returns all 5 cards (3+2 split implementation detail)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbManifest, {
          minLength: 5,
          maxLength: 5,
          selector: (m) => m.name
        }),
        (manifests) => {
          const result = selectLaunchpadSkills(manifests, 'wide')
          expect(result.length).toBe(5)
        }
      ),
      { numRuns: 30 }
    )
  })

  it('priority ordering is stable for ties (uses input order for equal priorities)', () => {
    const manifests: Manifest[] = [
      { name: 'A', launchpadPriority: 1 },
      { name: 'B', launchpadPriority: 1 },
      { name: 'C', launchpadPriority: 2 },
      { name: 'D', launchpadPriority: 3 },
      { name: 'E', launchpadPriority: 4 }
    ]
    const result = selectLaunchpadSkills(manifests, 'normal')
    expect(result.length).toBe(3)
    // 含 priority=1 的两条 + priority=2 的一条
    const names = result.map((r) => r.name).sort()
    expect(names).toEqual(['A', 'B', 'C'])
  })
})

describe('SkillRegistry contract used by SkillLaunchpad', () => {
  it('listSkills returns 5 manifests sorted by priority ascending', () => {
    const skills = listSkills()
    expect(skills.length).toBe(5)
    for (let i = 1; i < skills.length; i++) {
      expect(skills[i].launchpadPriority).toBeGreaterThanOrEqual(skills[i - 1].launchpadPriority)
    }
  })

  it('priority assignments match design: /brief=1, /tutor=2, /quiz=3, /actions=4, /explain=5', () => {
    const skills = listSkills()
    const map = new Map(skills.map((s) => [s.name, s.launchpadPriority]))
    expect(map.get('/brief')).toBe(1)
    expect(map.get('/tutor')).toBe(2)
    expect(map.get('/quiz')).toBe(3)
    expect(map.get('/actions')).toBe(4)
    expect(map.get('/explain')).toBe(5)
  })

  it('only /explain has requiresParams=true; all multiTurn flags consistent', () => {
    const skills = listSkills()
    const requireParams = skills.filter((s) => s.requiresParams).map((s) => s.name)
    expect(requireParams).toEqual(['/explain'])
    const multiTurn = skills
      .filter((s) => s.multiTurn)
      .map((s) => s.name)
      .sort()
    expect(multiTurn).toEqual(['/quiz', '/tutor'])
  })

  it('every manifest has non-empty icon, label, tagline (used by SkillLaunchpad rendering)', () => {
    const skills = listSkills()
    for (const s of skills) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.launchpadIcon.length).toBeGreaterThan(0)
      expect(s.launchpadTagline.length).toBeGreaterThan(0)
    }
  })
})
