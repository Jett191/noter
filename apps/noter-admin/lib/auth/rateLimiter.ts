import 'server-only'

/**
 * Noter Admin · 登录 IP 滑动窗口限流(进程内 Map)
 *
 * 设计参见 design.md §Security 与 Requirements 1.7:
 *   每个 IP 在 10 分钟滑动窗口内最多允许 10 次登录请求,超出返回 429。
 *
 * 实现要点:
 *   1. 进程内 Map<ip, timestamps[]>,timestamps 为有序的请求时间(ms)。
 *   2. 每次调用 hit() 时:剔除窗口外的旧时间戳 → 判断剩余数量是否超阈 → 追加新时间戳。
 *   3. 多 Next.js 实例(Vercel/Edge 多区域)下不共享状态,这是 MVP 接受的折中;
 *      上线后可换 Redis(留有 RateLimiter 接口扩展点)。
 *   4. 提供周期性 sweep 清理无活动 IP 的内存,防止长期运行内存膨胀。
 *      首次调用时启动 setInterval(unref()),不影响进程退出。
 */

const WINDOW_MS = 10 * 60 * 1000 // 10 分钟
const MAX_HITS = 10
const SWEEP_INTERVAL_MS = 60 * 1000 // 每分钟清扫一次

interface IpRecord {
  /** 时间戳数组,升序 */
  hits: number[]
}

const _store = new Map<string, IpRecord>()
let _sweepStarted = false

function startSweepLoopOnce(): void {
  if (_sweepStarted) return
  _sweepStarted = true
  // 仅在 Node.js 服务端运行;避免在测试用例外耗时 timer 阻塞进程退出。
  const handle = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [ip, rec] of _store) {
      // 全部 hits 都过期 → 清理整条记录
      const lastHit = rec.hits[rec.hits.length - 1]
      if (lastHit === undefined || lastHit < cutoff) {
        _store.delete(ip)
      }
    }
  }, SWEEP_INTERVAL_MS)
  // unref 让此 timer 不阻塞 Node.js 进程退出;在 Edge runtime 中 setInterval 返回值不一定有 unref。
  if (typeof (handle as unknown as { unref?: () => void }).unref === 'function') {
    ;(handle as unknown as { unref: () => void }).unref()
  }
}

export interface RateLimitResult {
  /** 是否允许放行 */
  allowed: boolean
  /** 当前窗口内已记录的请求数(包含本次,如果 allowed=true) */
  count: number
  /** 窗口剩余等待秒数(allowed=false 时使用,allowed=true 时为 0) */
  retryAfterSec: number
}

/**
 * 记录一次 IP 请求并返回是否放行。
 *
 * @param ip 客户端 IP(由 lib/audit/writeAuditLog.extractRequestIp 同款方式提取)
 * @returns RateLimitResult
 *
 * 调用样例(POST /api/admin/auth/sign-in):
 *   const result = recordLoginAttempt(ip)
 *   if (!result.allowed) throw new RateLimitError('rate_limited', result.retryAfterSec)
 */
export function recordLoginAttempt(ip: string): RateLimitResult {
  startSweepLoopOnce()

  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const rec = _store.get(ip)
  const hits = rec ? rec.hits.filter((t) => t > cutoff) : []

  if (hits.length >= MAX_HITS) {
    // 窗口内最早一次 + 窗口长度 → 等其过期前不可再放行
    const earliest = hits[0]!
    const retryAfterMs = earliest + WINDOW_MS - now
    return {
      allowed: false,
      count: hits.length,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000))
    }
  }

  hits.push(now)
  _store.set(ip, { hits })

  return { allowed: true, count: hits.length, retryAfterSec: 0 }
}

/**
 * 仅供单元测试使用:重置内部存储。
 */
export function _resetRateLimiterForTest(): void {
  _store.clear()
}

/** 暴露常量便于测试断言 */
export const RATE_LIMITER_WINDOW_MS = WINDOW_MS
export const RATE_LIMITER_MAX_HITS = MAX_HITS
