/**
 * `/brief` Skill Handler —— 文档速览。
 *
 * 行为契约（design.md `/brief`、requirements 3.x / 9.1 / 15.1 / 15.4）：
 *   • 检索仅允许 `SummaryTool` + `OutlineTool`，**禁止**调用任何
 *     `ChunkSearchTool` 方法（property 6 / req 3.3 / req 15.1）。
 *   • 输出 `structured_message: BriefCard`，payload 五字段
 *     `{ docType, thesis, chapterMap, audience, readingPath }`。
 *   • 末尾追加一条 `follow_ups`：
 *       [开始私教 🎓→/tutor, 提取行动项 ✅→/actions, 考考我 📝→/quiz]
 *   • **不**写 `agent_skill_sessions`（单轮 Skill）。
 *   • 摘要缺失走降级路径：`getMarkdownPrefix(documentId, 3000)` +
 *     `getOutline()` 让 LLM 现场提取，且不向前端发送 SSE error（req 13.1）。
 *   • 整体超时 15s，超时通过 SSE error 事件返回（req 3.8 / 15.4）。
 *
 * 与 orchestrator 的衔接：dispatchSkill 中将以
 *   `await runBriefSkill({ ...input, params: decision.params }, sse)` 形式
 * 调用。本任务仅实现 Handler 与 prompt，dispatchSkill 接线由编排者在 5 个
 * Skill 全部完成后统一回填。
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.1, 15.1, 15.4
 */

import {
  BRIEF_SYSTEM_PROMPT,
  briefOutputSchema,
  buildBriefPromptFromMarkdown,
  buildBriefPromptFromSummary,
  type BriefOutput
} from '../prompts/brief'
import * as LLMTool from '../tools/llm'
import * as OutlineTool from '../tools/outline'
import * as SummaryTool from '../tools/summary'
import type { DocumentSummary } from '../tools/summary'
import type { SSEStreamHandle } from '../sse/stream'

// ---------------------------------------------------------------------------
// 入参 / 常量
// ---------------------------------------------------------------------------

/**
 * `runBriefSkill` 入参 —— 与其他 Skill Handler 风格保持一致。
 *
 * 字段语义：
 *   • userId / documentId：Route Handler 已校验过归属
 *   • messages：本期 `/brief` 不消费消息历史（直接基于结构化数据生成），保留以
 *     便未来扩展（例如根据用户上一句话调整 docType 倾向）
 *   • params：保留扩展位（本期未使用）
 *   • abortSignal：上游取消信号；与本 Handler 内 15s 超时合并下发给 LLM
 */
export interface RunBriefSkillInput {
  userId: string
  documentId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  params?: Record<string, unknown>
  abortSignal?: AbortSignal
}

/** `/brief` 处理超时（毫秒） —— requirements 3.8 / 15.4。 */
const BRIEF_TIMEOUT_MS = 15_000

/** markdown 降级前缀长度 —— requirements 3.7 / design.md 「15.4 ↔ 3000 字」。 */
const BRIEF_MARKDOWN_PREFIX_CHARS = 3000

/**
 * 摘要「核心字段」判定 —— requirements 3.7：「记录缺失或核心字段为空」时降级。
 *
 * 这里把核心定义为 `summary` 正文。`summary` 有正文哪怕 keyPoints / keywords
 * 缺失也能产出合格的速览；反之 summary 为空时即便其他字段还在，prompt 也无法
 * 拼出有效内容，必须降级。
 */
function isSummaryUsable(summary: DocumentSummary | null): summary is DocumentSummary {
  if (!summary) return false
  return typeof summary.summary === 'string' && summary.summary.trim().length > 0
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 执行 `/brief` Skill。
 *
 * 流程：
 *   1. 起 15s 超时 AbortController（与 input.abortSignal 合并）
 *   2. SummaryTool.getSummary + OutlineTool.getOutline 并行
 *   3. 摘要可用 → 走标准 prompt；不可用 → 走降级 prompt（再读 markdown 前缀）
 *   4. LLMTool.completeJson 强制输出五字段（schema 校验失败自动重试一次）
 *   5. SSE 推送 `structured_message: BriefCard` + `follow_ups`
 *   6. 任何阶段抛错（含超时 / abort / LLM 校验失败） → SSE error 事件
 *
 * Handler 内部不调用 `sse.close()`，由 `runAgent` 在 orchestrator resolve 后
 * 统一关闭流（保证终止帧 `[DONE]` 唯一）。
 */
export async function runBriefSkill(
  input: RunBriefSkillInput,
  sse: SSEStreamHandle
): Promise<void> {
  const { userId, documentId } = input

  // 15s 超时：派生一个内部 AbortController 把 input.abortSignal + 本 Handler
  // 的 timeout 合并；任一触发都会取消 LLM HTTP 请求。
  const timeoutCtrl = new AbortController()
  const externalSignal = input.abortSignal
  let externalAbortHandler: (() => void) | null = null

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    timeoutCtrl.abort()
  }, BRIEF_TIMEOUT_MS)
  // Node.js 下不阻塞进程退出
  const maybeNodeTimer = timer as unknown as { unref?: () => void }
  if (typeof maybeNodeTimer.unref === 'function') maybeNodeTimer.unref()

  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutCtrl.abort()
    } else {
      externalAbortHandler = () => timeoutCtrl.abort()
      externalSignal.addEventListener('abort', externalAbortHandler, {
        once: true
      })
    }
  }

  try {
    // —— 1. 并行拉摘要 + 大纲 ——
    //    SummaryTool.getSummary 失败时返回 null（内部已吞错），不会抛；
    //    OutlineTool.getOutline 在 supabase error / 解析异常时**会抛**——
    //    /brief 对 outline 缺失容忍（降级路径下 outline 也可能为空），所以
    //    这里把 outline 错误吞成 null，与 summary 行为对齐。
    const [summary, outline] = await Promise.all([
      SummaryTool.getSummary(documentId, userId),
      OutlineTool.getOutline(documentId, userId).catch(() => null)
    ])

    // —— 2. 选择 prompt 路径 ——
    let userPrompt: string
    if (isSummaryUsable(summary)) {
      userPrompt = buildBriefPromptFromSummary({ summary, outline })
    } else {
      // 降级路径：再次读取 markdown 前缀（OutlineTool）。同样吞错为 null。
      const markdownPrefix = await OutlineTool.getMarkdownPrefix(
        documentId,
        userId,
        BRIEF_MARKDOWN_PREFIX_CHARS
      ).catch(() => null)
      userPrompt = buildBriefPromptFromMarkdown({ markdownPrefix, outline })
    }

    // —— 3. 调 LLM 强约束 JSON ——
    const result: BriefOutput = await LLMTool.completeJson(
      [
        { role: 'system', content: BRIEF_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      briefOutputSchema,
      {
        abortSignal: timeoutCtrl.signal,
        // 把 timeoutMs 也下发给 LLMTool —— 防御 fetch 卡死、或下游不响应 abort：
        // 内部计时器先于本 Handler 的 setTimeout 触发也无所谓，最终都会 reject。
        timeoutMs: BRIEF_TIMEOUT_MS,
        temperature: 0.3
      }
    )

    // —— 4. 推送结构化卡片 + follow_ups ——
    sse.send({
      event: 'structured_message',
      messageType: 'BriefCard',
      payload: result
    })

    sse.send({
      event: 'follow_ups',
      chips: [
        { label: '开始私教 🎓', command: '/tutor' },
        { label: '提取行动项 ✅', command: '/actions' },
        { label: '考考我 📝', command: '/quiz' }
      ]
    })
  } catch (err) {
    // 超时 / abort / LLM 失败 / Zod 校验失败 / 其他未预期异常都收敛到这里。
    // SSE error 是幂等的（首次 error 后 closed=true，runAgent .catch 中的二次
    // sse.error 不会重复写帧），但本 Handler 这里要保留中文业务文案。
    if (timedOut) {
      sse.error({ error: '速览生成超时，请稍后重试', code: 504 })
    } else if (err instanceof Error && (err.name === 'AbortError' || err.name === 'DOMException')) {
      // 上游 abort：直接 rethrow 让 runAgent 走 'aborted' 收尾；不在这里多发一帧
      throw err
    } else {
      const message = err instanceof Error && err.message ? err.message : '速览生成失败'
      sse.error({ error: message })
    }
  } finally {
    clearTimeout(timer)
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler)
    }
  }
}
