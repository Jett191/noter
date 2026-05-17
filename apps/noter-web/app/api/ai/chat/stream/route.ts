/**
 * POST /api/ai/chat/stream
 *
 * Noter Agent SSE 入口（Task 8.1）。Route Handler **极薄**：仅负责
 *   1. 鉴权（@supabase/ssr cookie session 取 user_id）
 *   2. 两步文档校验：
 *      - 第一步：归属 + 软删 → 403（脱敏不区分「不存在 / 不属于 / 已软删」三种）
 *      - 第二步：仅在第一步通过后执行；status === 'ready' 失败时返回 422
 *   3. sessionId 校验：失败静默重置 mode='fresh'，并通过 SSE session_banner
 *      事件 status='ended' 让前端隐藏旧 banner（首条事件 prepend 到 runAgent 流前）
 *   4. 调用 `runAgent({...})` 拿到 ReadableStream<Uint8Array>，
 *      作为 Response.body 配合 SSE 头返回
 *
 * Route Handler 不参与 Skill 路由 / Tool 调用 / LLM；这些由 `@noter/agent-runtime`
 * 内的 orchestrator 完成。
 *
 * Validates: Requirements 10.1, 12.1, 12.2, 12.3, 12.4, 12.6, 13.5
 */

import { z } from 'zod'
import { runAgent, type SkillName } from '@noter/agent-runtime'

import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/admin'
import { handler } from '@/utils/http/handler'
import { error } from '@/utils/http/response'

// ---------------------------------------------------------------------------
// 请求体校验
// ---------------------------------------------------------------------------

const SKILL_NAMES = ['/brief', '/tutor', '/explain', '/actions', '/quiz'] as const

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
})

/**
 * 请求体形状（Req 10.1）：`{ documentId, messages, command?, params?, sessionId? }`。
 *
 * 注意：`messages` 允许为空数组——三入口同源中点 SkillLaunchpad 卡时只发 command，
 * 此时 messages 可以为空；orchestrator 自身能处理「无 user message」的 fresh+command 路径。
 */
const chatStreamSchema = z.object({
  documentId: z.string().uuid('documentId 格式不正确'),
  messages: z.array(messageSchema),
  command: z.enum(SKILL_NAMES).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().uuid('sessionId 格式不正确').optional()
})

// ---------------------------------------------------------------------------
// 响应头（任务文档明确：仅设置这三项）
// ---------------------------------------------------------------------------

const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive'
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export const POST = handler(async (request: Request) => {
  // —— 1. 鉴权 ——
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // —— 2. 解析请求体（Zod 抛错由 handler 转 400） ——
  const body = chatStreamSchema.parse(await request.json())

  // —— 3. 第一步校验：归属 + 软删 → 403（脱敏不区分三种） ——
  // 不返回 status 之外的字段，避免任何形式的信息泄露；status 仅用于第二步判定。
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('status')
    .eq('id', body.documentId)
    .eq('user_id', user.id)
    .eq('deleted', 0)
    .maybeSingle<{ status: string }>()

  if (docErr || !doc) {
    return error('无权访问该文档', 403)
  }

  // —— 4. 第二步校验：状态 ≠ ready → 422（仅在第一步通过后执行） ——
  if (doc.status !== 'ready') {
    return error('文档尚未处理完成', 422)
  }

  // —— 5. sessionId 校验（agent_skill_sessions 表对 authenticated 不可读，须 service_role） ——
  // 校验通过 → 透传给 runAgent；失败 → 静默重置 fresh + 在流首条 prepend banner。
  let validatedSessionId: string | undefined = body.sessionId
  let endedBannerSkill: SkillName | null = null

  if (body.sessionId) {
    const admin = getServiceClient()

    // 严格校验：id + user_id + document_id + 未软删 + 未过期
    const { data: session } = await admin
      .from('agent_skill_sessions')
      .select('id')
      .eq('id', body.sessionId)
      .eq('user_id', user.id)
      .eq('document_id', body.documentId)
      .eq('deleted', 0)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle<{ id: string }>()

    if (!session) {
      // 严格校验失败 → 不再把 sessionId 传给 runAgent
      validatedSessionId = undefined

      // 尽力获取 skill 字段用于 banner 事件：放宽到 id + user_id；
      // 若仍找不到（sessionId 不归属当前用户或彻底不存在），则跳过 banner——
      // 此情况下前端理应没有为该 sessionId 显示的 banner，无需隐藏。
      const { data: anySession } = await admin
        .from('agent_skill_sessions')
        .select('skill')
        .eq('id', body.sessionId)
        .eq('user_id', user.id)
        .maybeSingle<{ skill: string }>()

      if (anySession?.skill && isSkillName(anySession.skill)) {
        endedBannerSkill = anySession.skill
      }
    }
  }

  // —— 6. 调用 runAgent（同步返回 stream，agent 的实际工作在 microtask 中执行） ——
  const { stream } = runAgent({
    userId: user.id,
    documentId: body.documentId,
    messages: body.messages,
    command: body.command,
    params: body.params,
    sessionId: validatedSessionId
  })

  // —— 7. 若需 prepend session_banner status='ended'，包一层 ReadableStream ——
  const responseStream =
    endedBannerSkill !== null ? prependEndedBanner(stream, endedBannerSkill) : stream

  return new Response(responseStream, { headers: SSE_HEADERS })
})

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function isSkillName(value: string): value is SkillName {
  return (SKILL_NAMES as readonly string[]).includes(value)
}

/**
 * 把 `session_banner status='ended'` 作为首条事件 prepend 到 runAgent 输出流前。
 *
 * 不复用 agent-runtime 的 createSSEStream：那需要在 runAgent 之外重建一条流，
 * 反而更繁琐。这里用最小封装手写一个 ReadableStream 适配器：
 *   - start: 先写 banner 帧，再 pump 上游流
 *   - cancel: 把客户端断开向上游传播，避免 runAgent 内部 orchestrator 继续工作
 */
function prependEndedBanner(
  source: ReadableStream<Uint8Array>,
  skill: SkillName
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const bannerFrame = encoder.encode(
    `data: ${JSON.stringify({
      event: 'session_banner',
      skill,
      status: 'ended'
    })}\n\n`
  )

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(bannerFrame)
      const reader = source.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) controller.enqueue(value)
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        try {
          reader.releaseLock()
        } catch {
          // ignore: reader may already be released by upstream cancellation
        }
      }
    },
    async cancel(reason) {
      try {
        await source.cancel(reason)
      } catch {
        // ignore: upstream may already be closed
      }
    }
  })
}
