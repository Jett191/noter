/**
 * EmbeddingTool — Gemini Embedding (`gemini-embedding-2`, 768 维)。
 *
 * 与 `supabase/functions/vectorize-document/index.ts` 和
 * `apps/noter-web/app/api/search/route.ts` 共享同一份 Gemini Embedding 调用约定：
 *   - endpoint：`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`
 *   - body：`{ content: { parts: [{ text }] }, outputDimensionality: 768 }`
 *   - API key 通过 URL query `?key=...` 传递（与 vectorize-document / search 保持一致）
 *
 * 单条文本调用 `embedContent`（非 batch），因为 agent-runtime 只在 `/explain` 中
 * 对单个 concept 生成向量，复用 search 路由的等价实现。
 *
 * 环境变量优先级：`GEMINI_API_KEY` ?? `EMBEDDING_API_KEY`，与 README 中描述一致。
 *
 * _Validates Requirements: 5.4_
 */

const GEMINI_EMBEDDING_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent'

const EMBEDDING_DIMENSIONS = 768

export interface EmbedOptions {
  /** 可选的 AbortSignal，用于上层超时取消 */
  abortSignal?: AbortSignal
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.EMBEDDING_API_KEY
  if (!key) {
    throw new Error(
      '[agent-runtime] Gemini Embedding API key 未配置；请设置 GEMINI_API_KEY 或 EMBEDDING_API_KEY'
    )
  }
  return key
}

/**
 * 调用 Gemini Embedding 单条 embed 接口，返回 768 维向量。
 *
 * 失败情形：
 *   - 缺失 API key → 抛错
 *   - HTTP 非 2xx → 抛错（带状态码与响应体片段）
 *   - 返回向量缺失或维度不为 768 → 抛错（保护下游 pgvector(768) 类型）
 */
export async function embed(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('[agent-runtime] EmbeddingTool.embed: text 不能为空字符串')
  }

  const apiKey = getApiKey()

  const response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS
    }),
    signal: opts.abortSignal
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `[agent-runtime] Gemini Embedding API 调用失败: ${response.status} ${body.slice(0, 500)}`
    )
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] }
  }

  const values = data?.embedding?.values

  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `[agent-runtime] Gemini Embedding API 返回的向量维度异常 (expected ${EMBEDDING_DIMENSIONS}, got ${
        Array.isArray(values) ? values.length : 'non-array'
      })`
    )
  }

  return values
}
