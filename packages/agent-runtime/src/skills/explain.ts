/**
 * `/explain` Skill Handler —— 概念释疑（单轮、需 concept 参数）。
 *
 * 流程（与 design.md「`/explain` — 概念释疑」/ requirements 5.x 一致）：
 *
 *   1. **缺参数处理（本期简化）**：触发 `/explain` 但未附带 concept →
 *      仅通过 SSE `content` 事件回复一条文本「想了解哪个概念？请直接输入想了解的概念」，
 *      **不**写 `agent_skill_sessions`、**不**写 pending_skill；用户下一条消息走正常路径，
 *      由意图分类匹配到 `/explain` 并把消息内容当作 concept。
 *
 *   2. **检索**：EmbeddingTool（默认在 ChunkSearchTool 内自动注入）→
 *      `vectorSearch(concept, 5)` + `keywordSearch(concept, 3)`；按 chunkId 去重融合，
 *      vectorSearch 命中优先（保留首次出现顺序）。
 *
 *   3. **命中态**：用 `buildExplainPrompt` 让 LLM 输出 `{ markdown }`；
 *      references 由 Skill 侧用 ChunkHit 拼装（不让 LLM 编造）。
 *
 *   4. **0 命中降级**：调用 `buildFallbackExplainPrompt` 用 LLM 给通用解释，
 *      在 markdown 最前拼接「⚠️ 此解释非来自当前文档：」标注；references = []。
 *
 *   5. **输出**：SSE `structured_message: ExplainCard`，payload 形如
 *      `{ concept, markdown, references: { chunkId, headingPath, snippet }[] }`；
 *      末尾追加 `follow_ups`：`[再深一点→/explain, 关联概念有哪些→/explain]`。
 *
 *   6. **超时 25s**：整段流程通过 AbortController 受控；超时时抛 `LLMTimeoutError`，
 *      由上层 `runAgent` 的 `.catch` 转成 SSE error 事件下发。
 *
 * 关键约束：
 *
 *   - **不**调用 `sse.close()`：那是 `runAgent` 的职责；Skill 只负责发 `send(...)`。
 *   - **references 完整性**：每条 reference 的 `chunkId / headingPath / snippet`
 *     都直接来自数据库返回的 ChunkHit，不让 LLM 自行编造（Property 5）。
 *   - **超时受控**：25s 整段限制，包含 embedding + 检索 + LLM 调用三段时间预算。
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 9.2, 15.6
 */

import { z } from 'zod'

import { ChunkSearchTool } from '../tools/chunk-search'
import { complete as llmComplete, completeJson as llmCompleteJson } from '../tools/llm'
import { buildExplainPrompt, buildFallbackExplainPrompt } from '../prompts/explain'
import type { SSEStreamHandle } from '../sse/stream'
import type { ChunkHit } from '../types/tool'
import type { SkillContext, SkillHandler } from './types'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** /explain 整体超时（requirement 5.10 / 15.6）：25 秒 */
const EXPLAIN_TIMEOUT_MS = 25_000

/** 检索召回数量（design.md：vector top-5 + keyword top-3） */
const VECTOR_TOP_K = 5
const KEYWORD_TOP_K = 3

/** 0 命中降级时 markdown 前置标注 */
const NON_DOC_PREFIX = '⚠️ 此解释非来自当前文档：\n\n'

/** 单条 reference 中 snippet 的最大字符数；超出截断并加省略号，保护前端折叠区显示 */
const SNIPPET_MAX_CHARS = 400

/** LLM 命中态 JSON 模式的 schema：仅要求 `markdown` 字段 */
const explainJsonSchema = z.object({
  markdown: z.string().min(1, 'markdown 不能为空')
})

// ---------------------------------------------------------------------------
// Public input：runExplainSkill
// ---------------------------------------------------------------------------

export interface RunExplainSkillInput {
  userId: string
  documentId: string
  /** Skill Router 解析后的 params；典型形如 `{ concept: string }` */
  params?: Record<string, unknown>
  /** 上层取消信号（runAgent → orchestrator 派生的内部 signal） */
  abortSignal?: AbortSignal
}

/**
 * Skill 入口（外部调用形态）：与其他 Skill 保持 `runXxxSkill(input, sse)` 风格。
 * orchestrator 在 dispatchSkill 中调用此函数（Task 6.5 完成后将在 orchestrator 中
 * 把 `case '/explain'` 替换为对此函数的调用——本任务**仅**实现 Skill，不动
 * orchestrator）。
 */
export async function runExplainSkill(
  input: RunExplainSkillInput,
  sse: SSEStreamHandle
): Promise<void> {
  const concept = extractConcept(input.params)

  // —— 缺参数处理：仅发 content 文本提示，不创建 session、不写 pending_skill —— //
  if (!concept) {
    sse.send({
      event: 'content',
      content: '想了解哪个概念？请直接输入想了解的概念'
    })
    return
  }

  // —— 25s 整段超时控制：派生内部 AbortController，与外部 abortSignal 合并 —— //
  const timeoutCtrl = new AbortController()
  const externalSignal = input.abortSignal
  let externalAbortHandler: (() => void) | null = null
  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutCtrl.abort(externalSignal.reason)
    } else {
      externalAbortHandler = () => timeoutCtrl.abort(externalSignal.reason)
      externalSignal.addEventListener('abort', externalAbortHandler, {
        once: true
      })
    }
  }
  const timer = setTimeout(() => {
    timeoutCtrl.abort(new Error(`/explain timed out after ${EXPLAIN_TIMEOUT_MS}ms`))
  }, EXPLAIN_TIMEOUT_MS)
  // Node.js 下避免阻塞进程退出；浏览器 / 测试环境无 unref 时静默跳过
  const maybeNodeTimer = timer as unknown as { unref?: () => void }
  if (typeof maybeNodeTimer.unref === 'function') maybeNodeTimer.unref()

  try {
    // —— 检索：vectorSearch + keywordSearch，按 chunkId 去重融合 —— //
    const search = new ChunkSearchTool({
      userId: input.userId,
      documentId: input.documentId
    })

    // 并行触发；任一失败即让整段调用 reject（由 runAgent 转 SSE error）
    const [vectorHits, keywordHits] = await Promise.all([
      search.vectorSearch(concept, VECTOR_TOP_K),
      search.keywordSearch(concept, KEYWORD_TOP_K)
    ])
    const hits = mergeHits(vectorHits, keywordHits)

    // —— 0 命中降级：LLM 给通用解释 + markdown 标注「非文档内容」 —— //
    if (hits.length === 0) {
      const fallbackMarkdown = await llmComplete(buildFallbackExplainPrompt(concept), {
        abortSignal: timeoutCtrl.signal,
        temperature: 0.3,
        // 单次调用预算控制在 20s，给 SSE flush 留出余量
        timeoutMs: 20_000
      })

      sse.send({
        event: 'structured_message',
        messageType: 'ExplainCard',
        payload: {
          concept,
          markdown: NON_DOC_PREFIX + fallbackMarkdown.trim(),
          references: []
        }
      })

      sendFollowUps(sse)
      return
    }

    // —— 命中态：LLM 输出 markdown；references 由 Skill 侧从 hits 拼装 —— //
    const llmResult = await llmCompleteJson(buildExplainPrompt(concept, hits), explainJsonSchema, {
      abortSignal: timeoutCtrl.signal,
      temperature: 0.3,
      timeoutMs: 20_000
    })

    const references = hits.map((hit) => ({
      chunkId: hit.chunkId,
      headingPath: hit.headingPath,
      snippet: makeSnippet(hit.content)
    }))

    sse.send({
      event: 'structured_message',
      messageType: 'ExplainCard',
      payload: {
        concept,
        markdown: llmResult.markdown,
        references
      }
    })

    sendFollowUps(sse)
  } finally {
    clearTimeout(timer)
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler)
    }
  }
}

// ---------------------------------------------------------------------------
// Skill manifest export（与 brief / actions / quiz 占位保持同形）
// ---------------------------------------------------------------------------

export const explainSkill: SkillHandler = {
  name: '/explain',
  async handle(ctx: SkillContext): Promise<void> {
    await runExplainSkill(
      {
        userId: ctx.userId,
        documentId: ctx.documentId,
        params: ctx.params,
        abortSignal: ctx.abortSignal
      },
      ctx.sse
    )
  }
}

// ---------------------------------------------------------------------------
// 内部小工具
// ---------------------------------------------------------------------------

/**
 * 从 params 中提取 concept；只接受非空字符串。
 * `params.concept` 由 Router 第一级（显式 command + params）或第三级慢路径
 * （`classifyIntent` 中的 CONCEPT_PATTERNS 正则提取 / LLM 兜底）注入。
 */
function extractConcept(params: Record<string, unknown> | undefined): string | null {
  if (!params) return null
  const raw = params.concept
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 按 chunkId 去重融合两个召回列表，保留首次出现顺序。
 * 这里把 vectorHits 放前面（语义相关性更高），keywordHits 中重复的 chunkId 直接跳过。
 */
function mergeHits(vectorHits: readonly ChunkHit[], keywordHits: readonly ChunkHit[]): ChunkHit[] {
  const seen = new Set<string>()
  const merged: ChunkHit[] = []
  for (const hit of [...vectorHits, ...keywordHits]) {
    if (!hit.chunkId) continue
    if (seen.has(hit.chunkId)) continue
    seen.add(hit.chunkId)
    merged.push(hit)
  }
  return merged
}

/**
 * snippet 生成：取 chunk content 的前 SNIPPET_MAX_CHARS 个字符；超长以省略号截断。
 * 保留原内容（包括换行），避免破坏富文本片段；前端折叠区自行控制样式。
 */
function makeSnippet(content: string): string {
  if (content.length <= SNIPPET_MAX_CHARS) return content
  return content.slice(0, SNIPPET_MAX_CHARS) + '…'
}

/** 末尾追加 follow_ups：再深一点 / 关联概念有哪些（均指向 /explain） */
function sendFollowUps(sse: SSEStreamHandle): void {
  sse.send({
    event: 'follow_ups',
    chips: [
      { label: '再深一点', command: '/explain' },
      { label: '关联概念有哪些', command: '/explain' }
    ]
  })
}
