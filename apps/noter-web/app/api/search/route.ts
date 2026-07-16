import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { searchSchema } from '@/utils/feature/search/schemas'

const GEMINI_EMBEDDING_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent'

async function generateQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.EMBEDDING_API_KEY
  if (!apiKey) {
    throw new Error('EMBEDDING_API_KEY 环境变量未配置')
  }

  const response = await fetch(`${GEMINI_EMBEDDING_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text: query }] },
      outputDimensionality: 768
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini Embedding API 调用失败: ${response.status} ${body}`)
  }

  const data = await response.json()
  const values: number[] = data?.embedding?.values

  if (!Array.isArray(values) || values.length !== 768) {
    throw new Error('Gemini Embedding API 返回的向量维度异常')
  }

  return values
}

export const GET = handler(async (request: Request) => {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 解析查询参数
  const url = new URL(request.url)
  const rawParams = {
    query: url.searchParams.get('query') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined
  }

  const params = searchSchema.parse(rawParams)
  const { query, limit = 20 } = params

  // 生成 query embedding
  const queryEmbedding = await generateQueryEmbedding(query)

  // 调用 hybrid_search RPC
  const { data, error: rpcError } = await supabase.rpc('hybrid_search', {
    query_text: query,
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: limit
  })

  if (rpcError) {
    return error(rpcError.message, 500)
  }

  // 映射返回结果
  const results = (data ?? []).map(
    (row: {
      document_id: string
      title: string
      matched_content: string
      score: number
      match_type: string
    }) => ({
      documentId: row.document_id,
      title: row.title,
      matchedContent: row.matched_content,
      score: row.score,
      matchType: row.match_type
    })
  )

  return success(results)
})
