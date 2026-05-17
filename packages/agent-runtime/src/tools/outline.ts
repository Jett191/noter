/**
 * OutlineTool —— 见 design.md「Tool Layer」与 tasks.md Task 3.2。
 *
 * 职责：
 *   - getOutline(documentId, userId): 读 document_contents.outline，返回带 headingPath
 *     的 enriched OutlineNode 树（headingPath 由父链 title 拼成，方便 /tutor 直接传给
 *     getChapterChunks）。
 *   - getChapterChunks(documentId, userId, headingPath): 按 heading_path **前缀**过滤
 *     document_chunks，返回章节内全部分片，按 chunk_index 升序。
 *   - compressChapterChunks(chunks, maxTokens): 章节内容压缩辅助。token ≤ maxTokens
 *     直接全量；超长则首尾各 ≤1500 token + 中间等距抽样，总和 ≤ 5000 token；如果连
 *     最少一块都塞不下（单块极长）返回 needsLLMSummary 让调用方走章节级 LLM 摘要。
 *   - getMarkdownPrefix(documentId, userId, charLimit): 读 markdown_content 前 N 个字符
 *     （/brief 降级路径用）。
 *
 * 所有 SQL 强制 `document_id = :documentId AND user_id = :userId AND deleted = 0`，
 * 等价于一层应用层 RLS（agent-runtime 走 service_role，自带绕过 RLS 的能力，必须
 * 在每条 SQL 上重复谓词以防止跨用户/跨文档越权）。
 */

import { getSupabaseServiceClient } from '../db/client'
import type { ChunkHit } from '../types/tool'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/**
 * 文档大纲节点（已注入 headingPath）。
 *
 * DB 中 document_contents.outline 的原始 jsonb 形如：
 *   `{ id, level, title, children: [...] }`
 *
 * 此处对外暴露的结构在原始字段基础上再注入 `headingPath`，由根节点到当前节点的
 * `title` 串联而成；这样 /tutor 等消费方可以直接把 `node.headingPath` 喂给
 * `getChapterChunks(...)`，不必重新走树。
 */
export interface OutlineNode {
  /** 由解析阶段生成的标题锚点 ID（前端用于滚动定位）。 */
  id: string
  /** 标题层级（1-6，对应 h1-h6）。 */
  level: number
  /** 标题文本。 */
  title: string
  /** 由根节点 title 拼到当前节点的 title 数组（含自身），与 chunk.heading_path 同 schema。 */
  headingPath: string[]
  /** 子节点。 */
  children: OutlineNode[]
}

/** DB 中 outline jsonb 元素的原始 schema。 */
interface RawOutlineNode {
  id?: string
  level?: number
  title?: string
  children?: RawOutlineNode[]
}

export interface CompressedChapter {
  /** 拼接后的章节内容（可能含「[...省略...]」分隔符）。 */
  content: string
  /** 是否需要调用方走 LLM 章节级摘要压缩。 */
  needsLLMSummary: boolean
}

// ---------------------------------------------------------------------------
// getOutline
// ---------------------------------------------------------------------------

export async function getOutline(
  documentId: string,
  userId: string
): Promise<OutlineNode[] | null> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('document_contents')
    .select('outline')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .eq('deleted', 0)
    .maybeSingle()

  if (error) {
    throw new Error(`[OutlineTool.getOutline] supabase error: ${error.message}`)
  }
  if (!data || !data.outline) return null

  const raw = data.outline as RawOutlineNode[] | null
  if (!Array.isArray(raw)) return null

  return enrichOutline(raw, [])
}

/** 递归把每个节点注入 headingPath（祖先 title 累积链 + 自身 title）。 */
function enrichOutline(nodes: RawOutlineNode[], ancestors: string[]): OutlineNode[] {
  const result: OutlineNode[] = []
  for (const node of nodes) {
    const title = typeof node.title === 'string' ? node.title : ''
    const path = [...ancestors, title]
    result.push({
      id: typeof node.id === 'string' ? node.id : '',
      level: typeof node.level === 'number' ? node.level : 0,
      title,
      headingPath: path,
      children: Array.isArray(node.children) ? enrichOutline(node.children, path) : []
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// getChapterChunks
// ---------------------------------------------------------------------------

/**
 * 按 heading_path **前缀**过滤 chunks。
 *
 * 例如 headingPath = ["第一章"] 会匹配 chunk.heading_path = ["第一章"]、
 * ["第一章", "1.1"] 等所有以「第一章」开头的层级；headingPath = [] 则不过滤
 * （返回当前文档全部 chunk，调用方应避免空前缀以免拉穿）。
 *
 * 实现细节：在 SQL 层用 `heading_path #>> '{0}' = ?` 对第一级做粗筛（命中索引
 * 友好），其余前缀位在 JS 中比对。Postgres jsonb 没有原生「数组前缀」算子，
 * 完全在 SQL 中表达深前缀比对会非常冗长且参数化困难，章节内 chunk 数量很小
 * （单文档典型几十个），JS 二次过滤代价可忽略。
 */
export async function getChapterChunks(
  documentId: string,
  userId: string,
  headingPath: string[]
): Promise<ChunkHit[]> {
  const supabase = getSupabaseServiceClient()

  let query = supabase
    .from('document_chunks')
    .select('id, chunk_index, content, heading_path')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .eq('deleted', 0)
    .order('chunk_index', { ascending: true })

  // 第一级用 jsonb path 做粗筛（仅当 headingPath 非空），其余位 JS 过滤
  if (headingPath.length > 0) {
    // PostgREST 支持 `heading_path->>0` 取数组首元素文本；equals 通过 .eq()
    query = query.eq('heading_path->>0', headingPath[0])
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`[OutlineTool.getChapterChunks] supabase error: ${error.message}`)
  }
  if (!data) return []

  const result: ChunkHit[] = []
  for (const row of data as Array<{
    id: string
    chunk_index: number
    content: string | null
    heading_path: unknown
  }>) {
    const path = normalizeHeadingPath(row.heading_path)
    if (!isPrefixMatch(path, headingPath)) continue
    result.push({
      chunkId: row.id,
      chunkIndex: row.chunk_index,
      headingPath: path,
      content: row.content ?? '',
      score: 1
    })
  }
  return result
}

function normalizeHeadingPath(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => (typeof v === 'string' ? v : String(v ?? '')))
}

/** chunkPath 的前 prefix.length 个元素是否逐位等于 prefix。 */
function isPrefixMatch(chunkPath: string[], prefix: string[]): boolean {
  if (prefix.length === 0) return true
  if (chunkPath.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (chunkPath[i] !== prefix[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// compressChapterChunks
// ---------------------------------------------------------------------------

/** 单 chunk token 估算：粗略「字符数 / 3」近似，对中英文混合都偏保守。 */
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3)
}

/** 章节代表性采样上限：首尾段各 1500 token，整体 ≤ 5000 token。 */
const HEAD_TAIL_BUDGET = 1500
const SAMPLE_TOTAL_BUDGET = 5000

const ELLIPSIS_HEAD_MIDDLE = '\n\n[...省略部分内容，以下为代表性采样...]\n\n'
const ELLIPSIS_MIDDLE_TAIL = '\n\n[...省略部分内容...]\n\n'
const ELLIPSIS_DROPPED_MIDDLE = '\n\n[...省略中间内容...]\n\n'

export function compressChapterChunks(chunks: ChunkHit[], maxTokens: number): CompressedChapter {
  if (chunks.length === 0) {
    return { content: '', needsLLMSummary: false }
  }

  // 1. 全量在预算内 → 直接拼接返回
  const total = chunks.reduce((s, c) => s + estimateTokens(c.content), 0)
  if (total <= maxTokens) {
    return {
      content: chunks.map((c) => c.content).join('\n\n'),
      needsLLMSummary: false
    }
  }

  // 2. 代表性采样：首段 + 尾段（各 ≤ 1500 token）+ 中间等距抽样
  //    确保 head_tokens + tail_tokens + sampled_middle_tokens ≤ 5000
  const headEndIdx = takeFromStart(chunks, HEAD_TAIL_BUDGET)
  const tailStartIdx = takeFromEnd(chunks, headEndIdx, HEAD_TAIL_BUDGET)

  const head = chunks.slice(0, headEndIdx)
  const tail = chunks.slice(tailStartIdx)
  const middle = chunks.slice(headEndIdx, tailStartIdx)

  const headTokens = sumTokens(head)
  const tailTokens = sumTokens(tail)
  const middleBudget = Math.max(0, SAMPLE_TOTAL_BUDGET - headTokens - tailTokens)

  const sampledMiddle = sampleEvenly(middle, middleBudget)

  // 3. 极端情况：单 chunk 自身 > HEAD_TAIL_BUDGET 且数量 < 3 → head/tail/middle 都可能为空
  //    若什么都没采到，让调用方走 LLM 章节级摘要
  if (head.length === 0 && tail.length === 0 && sampledMiddle.length === 0) {
    return { content: '', needsLLMSummary: true }
  }

  // 4. 拼接（保留分段 ellipsis 提示读者哪里被压缩了）
  const parts: string[] = []
  if (head.length > 0) {
    parts.push(joinChunks(head))
  }

  const droppedMiddle = middle.length - sampledMiddle.length
  if (sampledMiddle.length > 0) {
    if (parts.length > 0) parts.push(ELLIPSIS_HEAD_MIDDLE)
    parts.push(joinChunks(sampledMiddle))
  } else if (droppedMiddle > 0) {
    if (parts.length > 0) parts.push(ELLIPSIS_DROPPED_MIDDLE)
  }

  if (tail.length > 0) {
    if (parts.length > 0) parts.push(ELLIPSIS_MIDDLE_TAIL)
    parts.push(joinChunks(tail))
  }

  return { content: parts.join(''), needsLLMSummary: false }
}

function joinChunks(chunks: ChunkHit[]): string {
  return chunks.map((c) => c.content).join('\n\n')
}

function sumTokens(chunks: ChunkHit[]): number {
  return chunks.reduce((s, c) => s + estimateTokens(c.content), 0)
}

/** 从头部累计 chunks，使总 token ≤ budget；返回不含的第一个 idx（即 head 长度）。 */
function takeFromStart(chunks: ChunkHit[], budget: number): number {
  let used = 0
  for (let i = 0; i < chunks.length; i++) {
    const t = estimateTokens(chunks[i].content)
    if (used + t > budget) return i
    used += t
  }
  return chunks.length
}

/** 从尾部累计 chunks，使总 token ≤ budget；返回 tail 起始 idx（含）。 */
function takeFromEnd(chunks: ChunkHit[], fromIdx: number, budget: number): number {
  let used = 0
  let start = chunks.length
  for (let i = chunks.length - 1; i >= fromIdx; i--) {
    const t = estimateTokens(chunks[i].content)
    if (used + t > budget) break
    used += t
    start = i
  }
  return start
}

/**
 * 在 middle 段内等距抽样，使总 token ≤ budget。
 *
 * 步长由 budget 与平均 token 推算，至少 1。从 idx=0 起步，按 step 累进；遇到
 * 当前候选超出剩余预算就跳过（继续等距步进，避免提前终止漏掉后段样本）。
 */
function sampleEvenly(chunks: ChunkHit[], budget: number): ChunkHit[] {
  if (chunks.length === 0 || budget <= 0) return []

  const totalTokens = sumTokens(chunks)
  if (totalTokens <= budget) return [...chunks]

  const avg = totalTokens / chunks.length
  // 估计能容纳的样本数
  const targetCount = Math.max(1, Math.floor(budget / Math.max(avg, 1)))
  const step = Math.max(1, Math.floor(chunks.length / targetCount))

  const sampled: ChunkHit[] = []
  let used = 0
  for (let i = 0; i < chunks.length; i += step) {
    const t = estimateTokens(chunks[i].content)
    if (used + t > budget) continue
    sampled.push(chunks[i])
    used += t
  }
  return sampled
}

// ---------------------------------------------------------------------------
// getMarkdownPrefix
// ---------------------------------------------------------------------------

/**
 * 读 markdown_content 的前 N 个字符（按 JS 字符串切分，多字节安全）。
 *
 * 用途：/brief 在 document_summaries 缺失时调用本方法 + getOutline() 让 LLM
 * 现场提取速览（详见 design.md `/brief` 降级路径）。
 *
 * SQL 强制 `document_id` + `user_id` + `deleted = 0` 谓词；不做服务端 substring，
 * 取出后在 JS 中 slice — Markdown 内容大小受文档管理模块限制（解析阶段已写入
 * document_contents），即便整体读出在 agent-runtime 同进程内传递成本也低，可以
 * 避免数据库侧 substring 字节/字符语义的混淆。
 */
export async function getMarkdownPrefix(
  documentId: string,
  userId: string,
  charLimit: number
): Promise<string | null> {
  if (charLimit < 0) {
    throw new Error('[OutlineTool.getMarkdownPrefix] charLimit must be non-negative')
  }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('document_contents')
    .select('markdown_content')
    .eq('document_id', documentId)
    .eq('user_id', userId)
    .eq('deleted', 0)
    .maybeSingle()

  if (error) {
    throw new Error(`[OutlineTool.getMarkdownPrefix] supabase error: ${error.message}`)
  }
  if (!data || typeof data.markdown_content !== 'string') return null

  if (charLimit === 0) return ''
  if (data.markdown_content.length <= charLimit) return data.markdown_content
  return data.markdown_content.slice(0, charLimit)
}
