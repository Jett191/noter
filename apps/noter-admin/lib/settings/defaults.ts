/**
 * Noter Admin · System Settings 默认值与 key 联合类型
 *
 * 与 migration `20260517223450_admin_platform_system_settings.sql` 中
 * `settings_key_chk` 白名单完全对齐。当 system_settings 表中某 key 缺失或读取失败时,
 * readSetting() 回退到此处的默认值。
 *
 * 4 项最小访问控制开关(详见 design.md / Requirements 24):
 *   - allow_user_upload          普通用户能否上传私有文档
 *   - allow_user_delete_own      普通用户能否删除自己的私有文档
 *   - public_documents_visible   公共文档是否对普通用户可见
 *   - audit_log_enabled          是否写入 admin_audit_logs(切换该开关自身始终写日志)
 */

export const SETTING_KEYS = [
  'allow_user_upload',
  'allow_user_delete_own',
  'public_documents_visible',
  'audit_log_enabled'
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

/** 各 key 的默认值,与 migration 中的 INSERT seed 保持一致(全部 true) */
export const SETTING_DEFAULTS: Readonly<Record<SettingKey, boolean>> = Object.freeze({
  allow_user_upload: true,
  allow_user_delete_own: true,
  public_documents_visible: true,
  audit_log_enabled: true
})

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value)
}
