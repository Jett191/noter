import 'server-only'

/**
 * Noter Admin · 审计日志写入封装
 *
 * 设计参见 design.md §3 (Architecture)、§Components / writeAuditLog、Requirements 23。
 *
 * 关键不变量:
 *   1. 写入受 system_settings.audit_log_enabled 开关控制 —— 当 enabled=false 时,
 *      除「切换 audit_log_enabled 自身」外,均跳过写入(仅 server log 一条 skip 提示)。
 *      切换该开关自身始终写日志的逻辑由 PATCH /api/admin/system-settings 的事务处理,
 *      调用方在切换该 key 时显式传入 force=true 即可绕过开关检查。
 *   2. 写入失败永远不影响主响应:函数始终 resolve,不抛错;失败仅 console.error。
 *   3. 不在 metadata 中持久化:密码 / token / 完整 markdown 等敏感数据(由调用方负责脱敏)。
 *   4. request_ip 从 X-Forwarded-For / X-Real-IP / Forwarded 头部按优先级提取,
 *      均缺失时为 null,允许内部脚本 / 系统任务调用。
 */

import { getSupabaseAdmin } from '../supabase/admin'
import { readSetting } from '../settings/readSetting'
import type { ActionType, TargetResourceType } from './actionTypes'

export interface WriteAuditLogInput {
  /** 实际操作管理员的 profile id(公共文档场景下并非占位的系统账号 id) */
  adminUserId: string
  /** 冗余存储管理员邮箱,便于列表展示与 profile 硬删后追溯 */
  adminEmail: string
  /** 操作类型枚举(参见 lib/audit/actionTypes.ts) */
  actionType: ActionType
  /** 目标资源类型枚举 */
  targetResourceType: TargetResourceType
  /** 目标资源 id,部分元操作可不传 */
  targetResourceId?: string | null
  /** 目标资源可读标识(用户邮箱 / 文档标题 / 分类名 / 标签名 / 设置 key 等) */
  targetResourceLabel?: string | null
  /** 操作专属上下文,默认空对象;务必由调用方对敏感字段做脱敏 */
  metadata?: Record<string, unknown>
  /** 触发请求的 Request 对象,用于提取 X-Forwarded-For 等 IP 头 */
  request?: Request | null
  /**
   * 强制写日志,绕过 audit_log_enabled 开关。
   * 仅用于「切换 audit_log_enabled 自身」事务,确保该开关变更行为始终被记录。
   */
  force?: boolean
}

/**
 * 从 Request 中提取调用方 IP。
 *
 * 优先级:X-Forwarded-For 第一段(去空白) → X-Real-IP → Forwarded `for=` 段。
 * 全部缺失 → null。
 *
 * 注:Vercel / Next.js 部署在 CDN/Proxy 后,X-Forwarded-For 是事实标准。
 */
function extractRequestIp(request?: Request | null): string | null {
  if (!request) return null
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xrealip = request.headers.get('x-real-ip')
  if (xrealip) return xrealip.trim()
  const forwarded = request.headers.get('forwarded')
  if (forwarded) {
    // Forwarded: for=192.0.2.43, for="[2001:db8:cafe::17]"
    const match = forwarded.match(/for=("?)([^;,"\s]+)\1/i)
    if (match?.[2]) return match[2]
  }
  return null
}

/**
 * 写入一条审计日志。
 *
 * 永远 resolve,不抛错;失败仅 server log。
 * 由 audit_log_enabled 开关控制(force=true 时绕过)。
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    if (!input.force) {
      const enabled = await readSetting('audit_log_enabled')
      if (enabled === false) {
        // 关闭审计:跳过写入,仅 server log 留痕
        console.info(
          `[noter-admin][audit] skipped (audit_log_enabled=false): ${input.actionType} on ${input.targetResourceType}`
        )
        return
      }
    }

    const supabase = getSupabaseAdmin()
    const requestIp = extractRequestIp(input.request)

    const { error } = await supabase.from('admin_audit_logs').insert({
      admin_user_id: input.adminUserId,
      admin_email: input.adminEmail,
      action_type: input.actionType,
      target_resource_type: input.targetResourceType,
      target_resource_id: input.targetResourceId ?? null,
      target_resource_label: input.targetResourceLabel ?? null,
      request_ip: requestIp,
      metadata: input.metadata ?? {}
    })

    if (error) {
      console.error(
        `[noter-admin][audit] write failed: ${error.message} (action=${input.actionType}, target=${input.targetResourceType}, code=${(error as { code?: string }).code ?? 'n/a'})`
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[noter-admin][audit] unexpected exception: ${msg} (action=${input.actionType})`)
  }
}
