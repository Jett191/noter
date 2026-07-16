/**
 * Skill 注册表 —— 显式注册 5 个 SkillManifest（不动态扫描）。
 *
 * 字段约定见 `packages/agent-runtime/src/types/skill.ts` 与
 * `.kiro/specs/noter-agent/design.md` 「TypeScript 接口」「5 个 Skill 优先级建议」。
 *
 * 优先级（数字越小越靠前；normal 取最小 3 个作为主推）：
 *   /brief = 1, /tutor = 2, /quiz = 3, /actions = 4, /explain = 5
 *
 * requiresParams：仅 `/explain` 为 true，其余 false。
 * multiTurn：`/tutor`、`/quiz` 为 true，其余 false。
 */

import type { SkillManifest, SkillName } from '../types/skill'

const MANIFESTS: Record<SkillName, SkillManifest> = {
  '/brief': {
    name: '/brief',
    label: '速览这篇',
    description: '30 秒掌握文档骨架、核心主张与推荐阅读路径，零冷启动入门。',
    multiTurn: false,
    launchpadPriority: 1,
    launchpadIcon: '📖',
    launchpadTagline: '30 秒掌握全文骨架',
    requiresParams: false
  },
  '/tutor': {
    name: '/tutor',
    label: '章节私教',
    description: 'AI 私教带你逐章精读，每章先讲核心、再以提问检验理解。',
    multiTurn: true,
    launchpadPriority: 2,
    launchpadIcon: '🎓',
    launchpadTagline: '逐章带读，稳扎稳打',
    requiresParams: false
  },
  '/quiz': {
    name: '/quiz',
    label: '考考我',
    description: '基于本文生成测验题，单选 / 多选 / 填空 / 简答任选，检验掌握度。',
    multiTurn: true,
    launchpadPriority: 3,
    launchpadIcon: '📝',
    launchpadTagline: '出题检验掌握度',
    requiresParams: false
  },
  '/actions': {
    name: '/actions',
    label: '行动项提取',
    description: '读完这篇该做什么：提取行动项、待学概念与延伸阅读建议。',
    multiTurn: false,
    launchpadPriority: 4,
    launchpadIcon: '✅',
    launchpadTagline: '读完这篇该做什么',
    requiresParams: false
  },
  '/explain': {
    name: '/explain',
    label: '解释概念',
    description: '指定一个概念，结合本文相关位置给出清晰定义与引用。',
    multiTurn: false,
    launchpadPriority: 5,
    launchpadIcon: '💡',
    launchpadTagline: '指定概念深度释疑',
    requiresParams: true
  }
}

const SKILL_NAMES: readonly SkillName[] = ['/brief', '/tutor', '/quiz', '/actions', '/explain']

/**
 * 按 name 查询 SkillManifest。未注册时抛错（路由层应保证不会传入未知 name）。
 */
export function getSkill(name: SkillName): SkillManifest {
  const manifest = MANIFESTS[name]
  if (!manifest) {
    throw new Error(`Unknown skill: ${name}`)
  }
  return manifest
}

/**
 * 列出全部已注册的 Skill，按 launchpadPriority 升序返回。
 *
 * SkillLaunchpad（前端镜像）会基于此顺序选取 normal 主推 3 张 / tall|wide 全量 5 张。
 */
export function listSkills(): SkillManifest[] {
  return SKILL_NAMES.map((n) => MANIFESTS[n]).sort(
    (a, b) => a.launchpadPriority - b.launchpadPriority
  )
}
