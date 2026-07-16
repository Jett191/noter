import 'server-only'

/**
 * GET /api/admin/dashboard/metrics
 *
 * Dashboard 6 个指标卡:
 *   1. 总用户数 (排除 is_system_account)
 *   2. 总文档数
 *   3. 今日新注册用户数
 *   4. 今日新文档数
 *   5. 7 日活跃用户数
 *   6. 总存储使用量
 *
 * 每个指标附带昨日同比(yesterday 同一时段的值）。
 *
 * 设计参见 design.md §6.4 (Dashboard) 与 Requirements 4, 5, 6:
 *   - 受 requireAdmin() 保护
 *   - 6 个聚合查询并发执行
 *   - profiles 查询附加 is_system_account=false
 */

import { withRouteHandler } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  const adminClient = getSupabaseAdmin()

  // ─── 2. 计算时间边界 ───
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const todayISO = todayStart.toISOString()
  const yesterdayISO = yesterdayStart.toISOString()
  const sevenDaysAgoISO = sevenDaysAgo.toISOString()

  // ─── 3. 并发执行 6 个当前指标 + 6 个昨日同比 ───
  const [
    totalUsersRes,
    totalDocsRes,
    todayNewUsersRes,
    todayNewDocsRes,
    activeUsers7dRes,
    totalStorageRes,
    // 昨日同比
    yesterdayTotalUsersRes,
    yesterdayTotalDocsRes,
    yesterdayNewUsersRes,
    yesterdayNewDocsRes,
    yesterdayActiveUsersRes,
    yesterdayStorageRes
  ] = await Promise.all([
    // 1. 总用户数
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_system_account', false)
      .eq('deleted', 0),

    // 2. 总文档数
    adminClient.from('documents').select('id', { count: 'exact', head: true }).eq('deleted', 0),

    // 3. 今日新注册用户数
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_system_account', false)
      .gte('created_at', todayISO),

    // 4. 今日新文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    // 5. 7 日活跃用户数 (有文档更新的用户)
    adminClient.rpc('count_active_users_7d', {
      since_date: sevenDaysAgoISO
    }),

    // 6. 总存储使用量 (documents.file_size 求和)
    adminClient.rpc('sum_storage_usage'),

    // ─── 昨日同比 ───
    // 1'. 截至昨日的总用户数
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_system_account', false)
      .eq('deleted', 0)
      .lt('created_at', todayISO),

    // 2'. 截至昨日的总文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', 0)
      .lt('created_at', todayISO),

    // 3'. 昨日新注册用户数
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_system_account', false)
      .gte('created_at', yesterdayISO)
      .lt('created_at', todayISO),

    // 4'. 昨日新文档数
    adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayISO)
      .lt('created_at', todayISO),

    // 5'. 昨日 7 日活跃用户数
    adminClient.rpc('count_active_users_7d', {
      since_date: new Date(sevenDaysAgo.getTime() - 24 * 60 * 60 * 1000).toISOString()
    }),

    // 6'. 截至昨日的总存储
    adminClient.rpc('sum_storage_usage_before', {
      before_date: todayISO
    })
  ])

  // ─── 4. 提取数值(容错:RPC 不存在时回退 0） ───
  const totalUsers = totalUsersRes.count ?? 0
  const totalDocs = totalDocsRes.count ?? 0
  const todayNewUsers = todayNewUsersRes.count ?? 0
  const todayNewDocs = todayNewDocsRes.count ?? 0
  const activeUsers7d =
    typeof activeUsers7dRes.data === 'number'
      ? activeUsers7dRes.data
      : ((activeUsers7dRes.data as number | null) ?? 0)
  const totalStorage =
    typeof totalStorageRes.data === 'number'
      ? totalStorageRes.data
      : ((totalStorageRes.data as number | null) ?? 0)

  const yesterdayTotalUsers = yesterdayTotalUsersRes.count ?? 0
  const yesterdayTotalDocs = yesterdayTotalDocsRes.count ?? 0
  const yesterdayNewUsers = yesterdayNewUsersRes.count ?? 0
  const yesterdayNewDocs = yesterdayNewDocsRes.count ?? 0
  const yesterdayActiveUsers =
    typeof yesterdayActiveUsersRes.data === 'number'
      ? yesterdayActiveUsersRes.data
      : ((yesterdayActiveUsersRes.data as number | null) ?? 0)
  const yesterdayStorage =
    typeof yesterdayStorageRes.data === 'number'
      ? yesterdayStorageRes.data
      : ((yesterdayStorageRes.data as number | null) ?? 0)

  // ─── 5. 返回响应 ───
  return success({
    metrics: {
      totalUsers: { value: totalUsers, yesterday: yesterdayTotalUsers },
      totalDocuments: { value: totalDocs, yesterday: yesterdayTotalDocs },
      todayNewUsers: { value: todayNewUsers, yesterday: yesterdayNewUsers },
      todayNewDocuments: { value: todayNewDocs, yesterday: yesterdayNewDocs },
      activeUsers7d: { value: activeUsers7d, yesterday: yesterdayActiveUsers },
      totalStorage: { value: totalStorage, yesterday: yesterdayStorage }
    }
  })
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
