/**
 * Skill 相关类型。
 *
 * 见 design.md 「TypeScript 接口」「5 个 Skill 优先级建议」。
 */

export type SkillName = '/brief' | '/tutor' | '/explain' | '/actions' | '/quiz'

/**
 * Skill 元数据描述对象。前端 SkillLaunchpad / SlashCommandMenu / 后端 Router
 * 与 orchestrator 共同消费此结构，因此所有字段均为必填。
 */
export interface SkillManifest {
  /** 斜杠命令形式的唯一标识，例如 `/brief`。 */
  name: SkillName
  /** 中文短标题（用于卡片标题），例如「速览这篇」。 */
  label: string
  /** 长描述（用于 SlashCommandMenu 展示）。 */
  description: string
  /** 是否多轮 Skill：`/tutor`、`/quiz` 为 true，其余 false。 */
  multiTurn: boolean
  /** 数字越小越靠前；SkillLaunchpad normal 尺寸取最小 3 个作为主推。 */
  launchpadPriority: number
  /** 启动卡片左上角 emoji 图标。 */
  launchpadIcon: string
  /** 启动卡片下方一句话价值描述。 */
  launchpadTagline: string
  /** true 时触发后需要参数（`/explain` 反问 concept）；其余 false。 */
  requiresParams: boolean
}
