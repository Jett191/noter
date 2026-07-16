/**
 * `/actions` Skill Handler —— 行动项提取（单轮、不写 session）。
 *
 * 流程（与 design.md 「`/actions` — 行动项提取」/ requirements 6.x 一致）：
 *
 *   1. **检索**：直读 `SummaryTool.getSummary` 的 5 个结构化字段
 *      （summary / key_points / keywords / suitable_scenarios / todos）+
 *      `OutlineTool.getOutline` 顶层章节标题 + `OutlineTool.getChapterChunks` 各章
 *      `chunk_index = 0` 的首段。**禁止**调用任何向量 / 混合 / 关键词搜索（design 15.1）。
 *
 *   2. **不强依赖 summary.todos**：todos 字段缺失或为空时仍走正常路径，由 LLM 从
 *      summary / keyPoints / keywords / suitableScenarios + outline 现场生成。
 *
 *   3. **降级**：`document_summaries` 整条记录缺失 → prompt 切换到「仅 outline +
 *      章首段」模式让 LLM 现场提取；与 todos 缺失路径同等对待，**不**发 SSE error。
 *
 *   4. **输出**：`structured_message: ActionsCard`，payload 形如
 *      `{ todos: string[], conceptsToLearn: string[], readingSuggestions: string[] }`；
 *      数量上限 20 / 8 / 5（Zod schema 约束 + 超出 slice 截断双保险）。
 *
 *   5. **末尾追加 follow_ups**：`[考考我 📝→/quiz, 开始私教 🎓→/tutor]`。
 *
 *   6. **超时 15s**：整段流程通过 AbortController 受控；超时时抛错，由上层
 *      `runAgent` 的 `.catch` 转成 SSE error 事件下发。
 *
 * 关键约束：
 *
 *   - **不**调用 `sse.close()`：那是 `runAgent` 的职责；Skill 只负责发 `send(...)`。
 *   - **不**写 `agent_skill_sessions`（单轮 Skill）。
 *   - **纯展示**：ActionsCard 不勾选 / 不编辑 / 不写回 notes。
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.3, 15.1, 15.5
 */

import { z } from 'zod'

import { completeJson as llmCompleteJson } from '../tools/llm'
import { getSummary, type DocumentSummary } from '../tools/summary'
import { getChapterChunks, getOutline, type OutlineNode } from '../tools/outline'
import { buildActionsPrompt, type ChapterHeadSnippet } from '../prompts/actions'
import type { SSEStreamHandle } from '../sse/stream'
import type { SkillContext, SkillHandler } from './types'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** /actions 整体超时（requirement 6.9 / 15.5）：15 秒 */
const ACTIONS_TIMEOUT_MS = 15_000

/** 数量上限（requirement 6.4） */
const MAX_TODOS = 20
const MAX_CONCEPTS = 8
const MAX_READINGS = 5

/** 单条章首段最大字符数；过长会显著拉长 prompt 也无助于 LLM 现场提取 */
const CHAPTER_HEAD_SNIPPET_CHARS = 600

/**
 * 章首段最多取的章节数。outline 章节数若过多（罕见，但深 outline 文档会有几十节），
 * prompt 会膨胀；保守取前 N 个顶层 + 子章节。/actions 关注全文骨架，不需要逐叶遍历。
 */
const MAX_CHAPTER_HEADS = 12

// ---------------------------------------------------------------------------
// LLM JSON Schema：上限由 zod 强制（数量超出报错触发重试），
// 单条字符串非空 + 长度上限放宽到 200 字（避免过严失败）
// ---------------------------------------------------------------------------

const itemSchema = z.string().min(1, '条目不能为空字符串').max(200, '条目过长（> 200 字符）')

const actionsJsonSchema = z.object({
  todos: z.array(itemSchema).max(MAX_TODOS, `todos 长度不能超过 ${MAX_TODOS}`),
  conceptsToLearn: z
    .array(itemSchema)
    .max(MAX_CONCEPTS, `conceptsToLearn 长度不能超过 ${MAX_CONCEPTS}`),
  readingSuggestions: z
    .array(itemSchema)
    .max(MAX_READINGS, `readingSuggestions 长度不能超过 ${MAX_READINGS}`)
})

type ActionsJson = z.infer<typeof actionsJsonSchema>

// ---------------------------------------------------------------------------
// Public input：runActionsSkill
// ---------------------------------------------------------------------------

export interface RunActionsSkillInput {
  userId: string
  documentId: string
  /** Skill Router 解析后的 params；当前 /actions 不消费任何 params 字段 */
  params?: Record<string, unknown>
  /** 上层取消信号（runAgent → orchestrator 派生的内部 signal） */
  abortSignal?: AbortSignal
}

/**
 * Skill 入口（外部调用形态）：与其他 Skill 保持 `runXxxSkill(input, sse)` 风格。
 *
 * orchestrator 在 dispatchSkill 中调用此函数（本任务**仅**实现 Skill，不动
 * orchestrator —— orchestrator 的 case '/actions' 切换由 Task 6.x 完成节再统一回填）。
 */
export async function runActionsSkill(
  input: RunActionsSkillInput,
  sse: SSEStreamHandle
): Promise<void> {
  // —— 15s 整段超时控制：派生内部 AbortController，与外部 abortSignal 合并 —— //
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
    timeoutCtrl.abort(new Error(`/actions timed out after ${ACTIONS_TIMEOUT_MS}ms`))
  }, ACTIONS_TIMEOUT_MS)
  // Node.js 下避免阻塞进程退出；浏览器 / 测试环境无 unref 时静默跳过
  const maybeNodeTimer = timer as unknown as { unref?: () => void }
  if (typeof maybeNodeTimer.unref === 'function') maybeNodeTimer.unref()

  try {
    // —— 1. 并行读取结构化字段 —— //
    // SummaryTool 不抛错（找不到返回 null）；OutlineTool 会抛 supabase 错误，
    // 抛出后由 runAgent .catch 转成 SSE error，是合理的"文档基础数据异常"信号。
    const [summary, outline] = await Promise.all([
      getSummary(input.documentId, input.userId),
      getOutline(input.documentId, input.userId)
    ])

    // —— 2. 选取章节并取每章首段（chunk_index = 0）—— //
    // outline 缺失（null）也允许走 LLM 现场提取，仅意味着 chapterHeads 为空。
    const selectedChapters = pickChapterPaths(outline ?? [], MAX_CHAPTER_HEADS)
    const chapterHeads = await collectChapterHeads(input.documentId, input.userId, selectedChapters)

    // —— 3. outlineTitles：顶层章节标题用于让 LLM 把握全文骨架 —— //
    const outlineTitles = (outline ?? []).map((n) => n.title).filter(Boolean)

    // —— 4. 调 LLM；JSON 模式 + Zod 校验 + 自动重试一次 —— //
    const result = await llmCompleteJson<ActionsJson>(
      buildActionsPrompt({
        summary: toPromptSummary(summary),
        outlineTitles,
        chapterHeads
      }),
      actionsJsonSchema,
      {
        abortSignal: timeoutCtrl.signal,
        temperature: 0.3,
        // 单次调用预算控制在 12s（含一次重试，整体 ≤ 15s 由外层 timer 兜底）
        timeoutMs: 12_000
      }
    )

    // —— 5. 二次截断：即便 schema 通过（或 LLM 偶发逾越），slice 强制上限 —— //
    const payload = {
      todos: result.todos.slice(0, MAX_TODOS),
      conceptsToLearn: result.conceptsToLearn.slice(0, MAX_CONCEPTS),
      readingSuggestions: result.readingSuggestions.slice(0, MAX_READINGS)
    }

    sse.send({
      event: 'structured_message',
      messageType: 'ActionsCard',
      payload
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
// Skill manifest export（与 brief / explain / quiz 占位保持同形）
// ---------------------------------------------------------------------------

export const actionsSkill: SkillHandler = {
  name: '/actions',
  async handle(ctx: SkillContext): Promise<void> {
    await runActionsSkill(
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
// 内部：章节路径选取
// ---------------------------------------------------------------------------

/**
 * 从 outline 中按"广度优先"挑选最多 `limit` 个章节路径用于章首段拉取。
 *
 * 选取策略：
 *   1. 顶层节点优先（最具代表性）
 *   2. 顶层不够时再补子节点（深度优先）
 *   3. 全部节点 < limit 时返回全部
 *
 * 返回的每个 path 直接喂给 `getChapterChunks(documentId, userId, path)`，
 * 由 OutlineTool 内部按 heading_path 前缀过滤再取 chunk_index = 0 那条作为首段。
 */
function pickChapterPaths(outline: readonly OutlineNode[], limit: number): string[][] {
  if (limit <= 0 || outline.length === 0) return []

  const selected: string[][] = []
  const seen = new Set<string>() // 用 JSON 序列化做去重 key

  // 第一轮：顶层节点
  for (const node of outline) {
    if (selected.length >= limit) break
    pushUnique(selected, seen, node.headingPath)
  }
  if (selected.length >= limit) return selected

  // 第二轮：再补子节点（深度优先）；某些文档只有一个顶层 root 节点，子节点才是真正的章节
  for (const node of outline) {
    if (selected.length >= limit) break
    walkChildren(node, selected, seen, limit)
  }

  return selected
}

function walkChildren(
  node: OutlineNode,
  selected: string[][],
  seen: Set<string>,
  limit: number
): void {
  for (const child of node.children) {
    if (selected.length >= limit) return
    pushUnique(selected, seen, child.headingPath)
    walkChildren(child, selected, seen, limit)
  }
}

function pushUnique(selected: string[][], seen: Set<string>, path: string[]): void {
  if (path.length === 0) return
  const key = JSON.stringify(path)
  if (seen.has(key)) return
  seen.add(key)
  selected.push(path)
}

// ---------------------------------------------------------------------------
// 内部：章首段拉取
// ---------------------------------------------------------------------------

/**
 * 并行拉取每个 headingPath 的 chunk_index = 0 首段。
 *
 * - getChapterChunks 已按 chunk_index 升序返回，取 [0] 即首段
 * - 单个章节查询失败 / 无 chunk → 跳过该章节（不让单点失败拖垮整体）
 * - 内容截断到 CHAPTER_HEAD_SNIPPET_CHARS 字符，避免 prompt 膨胀
 */
async function collectChapterHeads(
  documentId: string,
  userId: string,
  paths: readonly string[][]
): Promise<ChapterHeadSnippet[]> {
  if (paths.length === 0) return []

  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const chunks = await getChapterChunks(documentId, userId, path)
        if (chunks.length === 0) return null
        const head = chunks[0]
        return {
          headingPath: path,
          snippet: truncateSnippet(head.content)
        } satisfies ChapterHeadSnippet
      } catch {
        // 单个章节读取失败：返回 null 让外层 filter 剔除；
        // /actions 不应因为单章节查询异常而整体失败
        return null
      }
    })
  )

  return results.filter((x): x is ChapterHeadSnippet => x !== null)
}

function truncateSnippet(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= CHAPTER_HEAD_SNIPPET_CHARS) return trimmed
  return trimmed.slice(0, CHAPTER_HEAD_SNIPPET_CHARS) + '…'
}

// ---------------------------------------------------------------------------
// 内部：summary → prompt 输入映射
// ---------------------------------------------------------------------------

function toPromptSummary(summary: DocumentSummary | null): {
  summary: string | null
  keyPoints: string[]
  keywords: string[]
  suitableScenarios: unknown
  todos: string[]
} | null {
  if (!summary) return null
  return {
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    keywords: summary.keywords,
    suitableScenarios: summary.suitableScenarios,
    todos: summary.todos
  }
}

// ---------------------------------------------------------------------------
// 内部：follow_ups
// ---------------------------------------------------------------------------

/** 末尾追加 follow_ups：考考我 → /quiz、开始私教 → /tutor（与 design.md 表格一致） */
function sendFollowUps(sse: SSEStreamHandle): void {
  sse.send({
    event: 'follow_ups',
    chips: [
      { label: '考考我 📝', command: '/quiz' },
      { label: '开始私教 🎓', command: '/tutor' }
    ]
  })
}
