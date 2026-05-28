/**
 * Noter Admin · Audit Log Action Types & Target Resource Types
 *
 * 与 migration `20260517223449_admin_platform_admin_audit_logs.sql` 中
 * `audit_action_chk` / `audit_target_chk` 白名单完全对齐。
 *
 * 注:design.md 与 tasks.md 文案中提到的 "17 个 action_type" / "5 个 target_resource_type"
 * 是早期估算,迁移落库时对齐为 18 个 action_type + 6 个 target_resource_type:
 *   action_type   = 用户 5 + 公共文档 5 + 公共分类 3 + 公共标签 3 + 普通文档强删 1 + 系统设置 1 = 18
 *   target_type   = user / document / public_document / public_category / public_tag / system_settings = 6
 *
 * 本文件作为前后端共享的"权威常量",提供:
 *   - readonly tuple ACTION_TYPES / TARGET_RESOURCE_TYPES 用于运行时校验
 *   - 派生联合类型 ActionType / TargetResourceType 用于 TS 静态约束
 */

export const ACTION_TYPES = [
  // 用户管理 (5)
  'user.block',
  'user.unblock',
  'user.delete',
  'user.send_password_reset',
  'user.role_change',

  // 公共文档生命周期 (5)
  'public_document.upload',
  'public_document.metadata_update',
  'public_document.content_update',
  'public_document.rollback',
  'public_document.delete',

  // 公共分类 (3)
  'public_category.create',
  'public_category.update',
  'public_category.delete',

  // 公共标签 (3)
  'public_tag.create',
  'public_tag.update',
  'public_tag.delete',

  // 普通用户私有文档强制软删 (1)
  'document.force_delete',

  // 系统设置 (1)
  'system_settings.update'
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

export const TARGET_RESOURCE_TYPES = [
  'user',
  'document',
  'public_document',
  'public_category',
  'public_tag',
  'system_settings'
] as const

export type TargetResourceType = (typeof TARGET_RESOURCE_TYPES)[number]

/** 判断字符串是否为合法 ActionType。 */
export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value)
}

/** 判断字符串是否为合法 TargetResourceType。 */
export function isTargetResourceType(value: string): value is TargetResourceType {
  return (TARGET_RESOURCE_TYPES as readonly string[]).includes(value)
}
