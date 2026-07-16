import 'server-only'

/**
 * GET /api/admin/dashboard/trends?days=N
 *
 * 注册趋势与文档上传趋势:按天聚合,使用 generate_series 补 0 天。
 *
 * 设计参见 design.md §6.4 (Dashboard) 与 Requirements 5:
 *   - 受 requireAdmin() 保护
 *   - days 参数范围 [1, 90],默认 30
 *   - 返回 { registrations: [{date, count}], documents: [{date, count}] }
 *   - 使用 Supabase RPC 或直接查询 + 应用层补零
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  await requireAdmin()

  // ─── 2. 解析参数 ───
  const url = new URL(request.url)
  const daysParam = url.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : 30

  if (isNaN(days) || days < 1 || days > 90) {
    throw new ValidationError('days 参数无效,允许范围: 1-90')
  }

  // ─── 3. 计算时间范围 ───
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const startDate = new Date(todayStart)
  startDate.setDate(startDate.getDate() - days + 1)

  const startISO = startDate.toISOString()

  // ─── 4. 查询注册趋势与文档趋势 ───
  const adminClient = getSupabaseAdmin()

  const [registrationsRes, documentsRes] = await Promise.all([
    // 用户注册按天聚合
    adminClient
      .from('profiles')
      .select('created_at')
      .eq('is_system_account', false)
      .gte('created_at', startISO),

    // 文档创建按天聚合
    adminClient.from('documents').select('created_at').gte('created_at', startISO)
  ])

  // ─── 5. 应用层按天聚合 + 补零 ───
  const registrationCounts = aggregateByDay(
    (registrationsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
    startDate,
    days
  )

  const documentCounts = aggregateByDay(
    (documentsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
    startDate,
    days
  )

  return success({
    registrations: registrationCounts,
    documents: documentCounts
  })
}

/**
 * 将时间戳数组按天聚合,并用 generate_series 逻辑补零。
 */
function aggregateByDay(
  timestamps: string[],
  startDate: Date,
  days: number
): { date: string; count: number }[] {
  // 初始化每天计数为 0
  const countMap = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
    countMap.set(key, 0)
  }

  // 累加实际数据
  for (const ts of timestamps) {
    const key = new Date(ts).toISOString().slice(0, 10)
    if (countMap.has(key)) {
      countMap.set(key, (countMap.get(key) ?? 0) + 1)
    }
  }

  // 转为有序数组
  const result: { date: string; count: number }[] = []
  for (const [date, count] of countMap) {
    result.push({ date, count })
  }
  return result.sort((a, b) => a.date.localeCompare(b.date))
}

export const GET = withRouteHandler(handler, { timeoutMs: 10_000 })
