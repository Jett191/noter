import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EMBEDDING_API_KEY = Deno.env.get('Embedding')!

const GEMINI_BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${EMBEDDING_API_KEY}`

const MAX_CHUNK_SIZE = 1000
const OVERLAP_SIZE = 200
const EMBEDDING_BATCH_SIZE = 100
const TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

interface ChunkInfo {
  content: string
  chunk_index: number
  char_start: number
  char_end: number
  heading_path: string[]
}

/**
 * Clean markdown text for embedding:
 * - Remove image markdown syntax ![alt](url)
 * - Remove HTML tags
 * - Collapse multiple whitespace/newlines
 */
function cleanText(markdown: string): string {
  let text = markdown
  // Remove image markdown: ![alt text](url)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Collapse multiple newlines into double newline (paragraph boundary)
  text = text.replace(/\n{3,}/g, '\n\n')
  // Collapse multiple spaces into single space
  text = text.replace(/[ \t]+/g, ' ')
  // Trim each line
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
  // Remove leading/trailing whitespace
  text = text.trim()
  return text
}

/**
 * Extract heading path from markdown content up to a given position.
 * Returns the current heading hierarchy (e.g., ["Chapter 1", "Section 1.1"])
 */
function extractHeadingPath(markdown: string, position: number): string[] {
  const headingPath: string[] = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match

  // Track headings by level
  const headings: { level: number; title: string; pos: number }[] = []

  while ((match = headingRegex.exec(markdown)) !== null) {
    if (match.index > position) break
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      pos: match.index
    })
  }

  if (headings.length === 0) return []

  // Build heading path from the last heading at each level
  const levelMap = new Map<number, string>()
  for (const h of headings) {
    levelMap.set(h.level, h.title)
    // Clear deeper levels when a higher-level heading appears
    for (const [level] of levelMap) {
      if (level > h.level) {
        levelMap.delete(level)
      }
    }
  }

  // Sort by level and build path
  const sortedLevels = [...levelMap.entries()].sort((a, b) => a[0] - b[0])
  for (const [, title] of sortedLevels) {
    headingPath.push(title)
  }

  return headingPath
}

/**
 * Split cleaned text into chunks with overlap, preferring paragraph boundaries.
 * Tracks char_start and char_end relative to the cleaned text.
 */
function splitIntoChunks(cleanedText: string, originalMarkdown: string): ChunkInfo[] {
  const chunks: ChunkInfo[] = []

  if (!cleanedText || cleanedText.length === 0) {
    return chunks
  }

  // Split by paragraph boundaries (double newline)
  const paragraphs = cleanedText.split(/\n\n+/)
  let currentChunk = ''
  let chunkStart = 0
  let currentPos = 0
  let chunkIndex = 0

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]

    if (!paragraph.trim()) {
      currentPos += paragraph.length + 2 // +2 for \n\n
      continue
    }

    // If adding this paragraph would exceed max size
    if (currentChunk.length > 0 && currentChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE) {
      // Save current chunk
      const charEnd = chunkStart + currentChunk.length
      chunks.push({
        content: currentChunk.trim(),
        chunk_index: chunkIndex,
        char_start: chunkStart,
        char_end: charEnd,
        heading_path: extractHeadingPath(originalMarkdown, chunkStart)
      })
      chunkIndex++

      // Calculate overlap start position
      const overlapStart = Math.max(0, currentChunk.length - OVERLAP_SIZE)
      const overlapText = currentChunk.substring(overlapStart)
      currentChunk = overlapText + '\n\n' + paragraph
      chunkStart = charEnd - (currentChunk.length - paragraph.length - 2)
      // Adjust chunkStart to be the start of the overlap in the original text
      chunkStart = charEnd - overlapText.length
    } else if (paragraph.length > MAX_CHUNK_SIZE) {
      // Handle very long paragraphs: force split
      if (currentChunk.length > 0) {
        const charEnd = chunkStart + currentChunk.length
        chunks.push({
          content: currentChunk.trim(),
          chunk_index: chunkIndex,
          char_start: chunkStart,
          char_end: charEnd,
          heading_path: extractHeadingPath(originalMarkdown, chunkStart)
        })
        chunkIndex++
        chunkStart = charEnd - Math.min(currentChunk.length, OVERLAP_SIZE)
        currentChunk = ''
      }

      // Split long paragraph by sentence or fixed size
      let paraOffset = currentPos
      let remaining = paragraph
      while (remaining.length > 0) {
        let splitPoint = MAX_CHUNK_SIZE
        if (remaining.length > MAX_CHUNK_SIZE) {
          // Try to split at sentence boundary
          const searchArea = remaining.substring(MAX_CHUNK_SIZE - 200, MAX_CHUNK_SIZE)
          const sentenceEnd = Math.max(
            searchArea.lastIndexOf('。'),
            searchArea.lastIndexOf('.'),
            searchArea.lastIndexOf('！'),
            searchArea.lastIndexOf('？'),
            searchArea.lastIndexOf('\n')
          )
          if (sentenceEnd > 0) {
            splitPoint = MAX_CHUNK_SIZE - 200 + sentenceEnd + 1
          }
        } else {
          splitPoint = remaining.length
        }

        const piece = remaining.substring(0, splitPoint)
        const charEnd = paraOffset + piece.length
        chunks.push({
          content: piece.trim(),
          chunk_index: chunkIndex,
          char_start: paraOffset,
          char_end: charEnd,
          heading_path: extractHeadingPath(originalMarkdown, paraOffset)
        })
        chunkIndex++

        // Apply overlap
        const overlapLen = Math.min(OVERLAP_SIZE, piece.length)
        const nextStart = splitPoint - overlapLen
        remaining = remaining.substring(nextStart)
        paraOffset = paraOffset + nextStart
      }

      currentChunk = ''
      chunkStart = currentPos + paragraph.length
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length === 0) {
        currentChunk = paragraph
        chunkStart = currentPos
      } else {
        currentChunk += '\n\n' + paragraph
      }
    }

    currentPos += paragraph.length + 2 // +2 for the \n\n separator
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      chunk_index: chunkIndex,
      char_start: chunkStart,
      char_end: chunkStart + currentChunk.length,
      heading_path: extractHeadingPath(originalMarkdown, chunkStart)
    })
  }

  return chunks
}

/**
 * Batch embed chunks using Gemini Embedding API.
 * Processes in batches of up to 100.
 */
async function batchEmbed(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)

    const requests = batch.map((text) => ({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text }] },
      outputDimensionality: 768
    }))

    const response = await fetch(GEMINI_BATCH_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const embeddings = data.embeddings as { values: number[] }[]

    for (const embedding of embeddings) {
      allEmbeddings.push(embedding.values)
    }
  }

  return allEmbeddings
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let documentId: string
  let userId: string

  try {
    const body = await req.json()
    documentId = body.documentId
    userId = body.userId

    if (!documentId || !userId) {
      return new Response(JSON.stringify({ error: 'Missing documentId or userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  console.log(`[vectorize-document] START documentId=${documentId}, userId=${userId}`)

  // Wrap in timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Step 1: Update vector_status to 'running'
    const { error: updateRunningError } = await supabase
      .from('documents')
      .update({ vector_status: 'running', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', userId)

    if (updateRunningError) {
      throw new Error(`Failed to update vector_status to running: ${updateRunningError.message}`)
    }

    // Step 2: Read markdown from document_contents
    const { data: contentData, error: contentError } = await supabase
      .from('document_contents')
      .select('markdown_content')
      .eq('document_id', documentId)
      .eq('deleted', 0)
      .single()

    if (contentError || !contentData) {
      throw new Error(
        `Failed to read document_contents: ${contentError?.message || 'No content found'}`
      )
    }

    const markdownContent = contentData.markdown_content as string

    if (!markdownContent || markdownContent.trim().length === 0) {
      throw new Error('Document content is empty')
    }

    // Step 3: Clean text
    const cleanedText = cleanText(markdownContent)

    if (cleanedText.length === 0) {
      throw new Error('Cleaned text is empty after processing')
    }

    // Step 4: Split into chunks
    const chunks = splitIntoChunks(cleanedText, markdownContent)

    if (chunks.length === 0) {
      throw new Error('No chunks generated from document')
    }

    console.log(
      `[vectorize-document] Cleaned text length=${cleanedText.length}, chunks=${chunks.length}`
    )

    // Step 5: Delete existing chunks for idempotency
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    // Step 6: Batch embed chunks
    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await batchEmbed(chunkTexts)

    // Step 7: Insert chunks into document_chunks table
    const chunkRecords = chunks.map((chunk, idx) => ({
      user_id: userId,
      document_id: documentId,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      heading_path: chunk.heading_path,
      token_count: Math.ceil(chunk.content.length / 4), // rough estimate
      char_start: chunk.char_start,
      char_end: chunk.char_end,
      embedding: JSON.stringify(embeddings[idx]),
      metadata: {},
      deleted: 0,
      created_at: new Date().toISOString()
    }))

    // Insert in batches to avoid payload size limits
    const INSERT_BATCH_SIZE = 50
    for (let i = 0; i < chunkRecords.length; i += INSERT_BATCH_SIZE) {
      const batch = chunkRecords.slice(i, i + INSERT_BATCH_SIZE)
      const { error: insertError } = await supabase.from('document_chunks').insert(batch)

      if (insertError) {
        throw new Error(`Failed to insert chunks (batch ${i}): ${insertError.message}`)
      }
    }

    // Step 8: Update vector_status to 'success'
    const { error: updateSuccessError } = await supabase
      .from('documents')
      .update({
        vector_status: 'success',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', userId)

    if (updateSuccessError) {
      throw new Error(`Failed to update vector_status to success: ${updateSuccessError.message}`)
    }

    // Step 9: Trigger generate-summary and generate-mindmap in parallel
    console.log(
      `[vectorize-document] Embeddings done, chunks inserted. Triggering summary + mindmap`
    )
    const triggerPayload = { documentId, userId }

    const [summaryResult, mindmapResult] = await Promise.allSettled([
      supabase.functions.invoke('generate-summary', {
        body: triggerPayload
      }),
      supabase.functions.invoke('generate-mindmap', {
        body: triggerPayload
      })
    ])

    // Log trigger results but don't fail the vectorize step
    const triggerErrors: string[] = []
    if (summaryResult.status === 'rejected') {
      triggerErrors.push(`generate-summary trigger failed: ${summaryResult.reason}`)
    }
    if (mindmapResult.status === 'rejected') {
      triggerErrors.push(`generate-mindmap trigger failed: ${mindmapResult.reason}`)
    }

    clearTimeout(timeoutId)

    return new Response(
      JSON.stringify({
        success: true,
        chunkCount: chunks.length,
        triggerErrors: triggerErrors.length > 0 ? triggerErrors : undefined
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    clearTimeout(timeoutId)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = error instanceof DOMException && error.name === 'AbortError'
    const finalMessage = isTimeout ? 'vectorize-document timed out (2 minutes)' : errorMessage

    // Mark as failed
    await supabase
      .from('documents')
      .update({
        vector_status: 'failed',
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', userId)

    // Record error in document_processing_jobs
    await supabase.from('document_processing_jobs').insert({
      user_id: userId,
      document_id: documentId,
      job_type: 'vectorize-document',
      status: 'failed',
      error_message: finalMessage,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      deleted: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({ success: false, error: finalMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
