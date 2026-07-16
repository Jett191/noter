/**
 * agent_skill_sessions 表对应的领域类型。
 *
 * 表字段（migration 20260516175445_create_agent_skill_sessions_table.sql）：
 *   id (uuid PK) / user_id (uuid FK profiles) / document_id (uuid FK documents)
 *   skill (text) / state (jsonb) / expires_at (timestamptz default now()+24h)
 *   deleted (int default 0) / created_at / updated_at
 *
 * /tutor 与 /quiz 各自的 state 形状由 design.md → Data Models 定义；
 * 这里通过 `SkillSessionState` 索引签名保留 forward compatibility，
 * 具体 Skill 在自己的模块里通过类型收窄使用。
 */

import type { SkillName } from './skill'

export type SkillSessionStatus =
  | 'active'
  | 'configuring'
  | 'answering'
  | 'graded'
  | 'ended'
  | 'interrupted'

/**
 * Skill session state 通用形状。所有 Skill 的 state 都至少含 status；
 * 各 Skill 自有字段（如 currentChapterIndex / questions / userAnswers ...）
 * 通过 string 索引签名携带，由 Skill Handler 自己收窄类型。
 */
export interface SkillSessionState {
  status: SkillSessionStatus
  [key: string]: unknown
}

/** DB 行 → 领域对象（已加载或刚 upsert 完成的 session） */
export interface SkillSession {
  id: string
  userId: string
  documentId: string
  skill: SkillName
  state: SkillSessionState
  expiresAt: string
  createdAt: string
  updatedAt: string
}

/**
 * upsert 入参：
 *   - 不带 `id` → INSERT；DB 自动生成 id / expires_at / created_at / updated_at
 *   - 带 `id`   → UPDATE（强制 user_id 谓词），调用方需保证 id 真实存在
 *
 * `expiresAt` 可选；缺省时由 DB 默认值（now() + 24h）生效。
 */
export interface SkillSessionUpsertInput {
  id?: string
  userId: string
  documentId: string
  skill: SkillName
  state: SkillSessionState
  expiresAt?: string
}
