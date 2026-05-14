import '@std/dotenv/load'
import { createClient } from '@supabase/supabase-js'

// ─── Environment ────────────────────────────────────────────────────────────
const MIMO_API_KEY = Deno.env.get('MIMO_API_KEY')!
const MIMO_API_ENDPOINT = Deno.env.get('MIMO_API_ENDPOINT')!
const MIMO_MODEL = Deno.env.get('MIMO_MODEL')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EMBEDDING_API_KEY = Deno.env.get('EMBEDDING_API_KEY')!
const PORT = parseInt(Deno.env.get('PORT') || '3002')

const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${EMBEDDING_API_KEY}`

// ─── Supabase Client ────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── Types ──────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  documentId: string
  messages: ChatMessage[]
}

interface DocumentChunk {
  content: string
  heading_path: string[]
  chunk_index: number
  similarity: number
}

// ─── Embedding ──────────────────────────────────────────────────────────────
async function embedQuery(text: string): Promise<number[]> {
  const response = await fetch(GEMINI_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text }] },
      outputDimensionality: 768
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.embedding.values as number[]
}

// ─── Vector Search ──────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function retrieveRelevantChunks(
  documentId: string,
  queryEmbedding: number[],
  topK = 5
): Promise<DocumentChunk[]> {
  // Fetch all chunks for this document
  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('content, heading_path, chunk_index, embedding')
    .eq('document_id', documentId)
    .eq('deleted', 0)
    .order('chunk_index', { ascending: true })

  if (error || !chunks || chunks.length === 0) {
    return []
  }

  // Calculate similarity for each chunk
  const scored = chunks.map((chunk) => {
    const chunkEmbedding: number[] =
      typeof chunk.embedding === 'string' ? JSON.parse(chunk.embedding) : chunk.embedding

    return {
      content: chunk.content as string,
      heading_path: (chunk.heading_path || []) as string[],
      chunk_index: chunk.chunk_index as number,
      similarity: cosineSimilarity(queryEmbedding, chunkEmbedding)
    }
  })

  // Sort by similarity descending and take top K
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, topK)
}

// ─── Build System Prompt ────────────────────────────────────────────────────
function buildSystemPrompt(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) {
    return `你是一个智能文档助手。用户正在阅读一篇文档，但目前没有找到与问题相关的内容片段。请根据你的知识尽力回答，并提示用户该问题可能超出了文档范围。`
  }

  const contextParts = chunks.map((chunk, i) => {
    const headingInfo =
      chunk.heading_path.length > 0 ? `[位置: ${chunk.heading_path.join(' > ')}]` : ''
    return `--- 片段 ${i + 1} ${headingInfo} ---\n${chunk.content}`
  })

  const context = contextParts.join('\n\n')

  return `你是一个智能文档助手。用户正在阅读一篇文档，并围绕文档内容向你提问。

以下是与用户问题最相关的文档片段：

${context}

请根据以上文档内容回答用户的问题。要求：
1. 优先基于文档内容回答，如果文档中没有相关信息，可以结合你的知识补充，但需要说明
2. 回答要简洁、准确、有条理
3. 如果用户的问题与文档内容无关，礼貌地告知并尝试引导回文档相关话题
4. 使用中文回答`
}

// ─── Stream Chat Completion ─────────────────────────────────────────────────
async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
) {
  try {
    const response = await fetch(MIMO_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MIMO_API_KEY}`
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages,
        temperature: 0.7,
        stream: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      onError(`LLM API error (${response.status}): ${errorText}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      onError('No response body')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      const value = result.value
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            onChunk(content)
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    onDone()
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error')
  }
}

// ─── CORS Headers ───────────────────────────────────────────────────────────
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

// ─── Request Handler ────────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  }

  // Chat endpoint (streaming)
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    return handleChat(req)
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  })
}

async function handleChat(req: Request): Promise<Response> {
  try {
    const body: ChatRequest = await req.json()
    const { documentId, messages } = body

    if (!documentId || !messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing documentId or messages' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    // Get the latest user message for embedding
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUserMessage) {
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      })
    }

    // Step 1: Embed the user query
    const queryEmbedding = await embedQuery(lastUserMessage.content)

    // Step 2: Retrieve relevant document chunks
    const relevantChunks = await retrieveRelevantChunks(documentId, queryEmbedding, 5)

    // Step 3: Build the system prompt with context
    const systemPrompt = buildSystemPrompt(relevantChunks)

    // Step 4: Construct the full message list for LLM
    const llmMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages]

    // Step 5: Stream the response using SSE
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        streamChatCompletion(
          llmMessages,
          (text) => {
            // Send SSE event
            const event = `data: ${JSON.stringify({ content: text })}\n\n`
            controller.enqueue(encoder.encode(event))
          },
          () => {
            // Send done event
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          },
          (error) => {
            const event = `data: ${JSON.stringify({ error })}\n\n`
            controller.enqueue(encoder.encode(event))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        )
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    })
  }
}

// ─── Start Server ───────────────────────────────────────────────────────────
console.log(`🤖 noter-agent running on http://localhost:${PORT}`)
Deno.serve({ port: PORT }, handleRequest)
