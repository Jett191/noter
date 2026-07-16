import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ===== Types =====

interface MindmapNode {
  id: string
  label: string
  children: MindmapNode[]
}

interface HeadingInfo {
  level: number
  title: string
}

// ===== Helper Functions =====

/**
 * Extract heading structure (h1-h6) from markdown content
 */
function extractHeadings(markdown: string): HeadingInfo[] {
  const headings: HeadingInfo[] = []
  const lines = markdown.split('\n')

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim()
      })
    }
  }

  return headings
}

/**
 * Generate markdown outline from headings
 */
function generateMarkdownOutline(headings: HeadingInfo[]): string {
  return headings
    .map((h) => {
      const indent = '  '.repeat(h.level - 1)
      return `${indent}- ${h.title}`
    })
    .join('\n')
}

/**
 * Validate mindmap JSON structure recursively
 * Returns true if valid, throws error with description if invalid
 */
function validateMindmapNode(
  node: unknown,
  depth = 0,
  countRef = { count: 0 }
): node is MindmapNode {
  if (!node || typeof node !== 'object') {
    throw new Error(`Invalid node at depth ${depth}: node must be an object`)
  }

  const obj = node as Record<string, unknown>

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new Error(`Invalid node at depth ${depth}: "id" must be a non-empty string`)
  }

  if (typeof obj.label !== 'string' || obj.label.length === 0) {
    throw new Error(`Invalid node at depth ${depth}: "label" must be a non-empty string`)
  }

  if (!Array.isArray(obj.children)) {
    throw new Error(`Invalid node at depth ${depth}: "children" must be an array`)
  }

  countRef.count++
  if (countRef.count > 200) {
    throw new Error('Mindmap exceeds maximum of 200 nodes')
  }

  for (const child of obj.children) {
    validateMindmapNode(child, depth + 1, countRef)
  }

  return true
}

/**
 * Build the LLM prompt for mindmap generation
 */
function buildMindmapPrompt(headings: HeadingInfo[], markdownContent: string): string {
  const headingOutline =
    headings.length > 0
      ? headings.map((h) => `${'#'.repeat(h.level)} ${h.title}`).join('\n')
      : '(No headings found in document)'

  // Truncate content if too long to fit in context
  const maxContentLength = 12000
  const truncatedContent =
    markdownContent.length > maxContentLength
      ? markdownContent.slice(0, maxContentLength) + '\n\n... (content truncated)'
      : markdownContent

  return `You are a document analysis assistant. Based on the following document's heading structure and content, generate a mind map in JSON format.

## Requirements:
1. Output a single root node as JSON object
2. Each node must have: { "id": string, "label": string, "children": [] }
3. The "id" should be a short unique identifier (e.g., "node_1", "node_2", etc.)
4. The "label" should be a concise description (max 50 characters)
5. Total number of nodes must NOT exceed 200
6. The tree structure should reflect the document's logical hierarchy
7. Use the heading structure as the primary skeleton, enriched with key content points
8. Output ONLY valid JSON, no markdown code fences, no explanation

## Document Heading Structure:
${headingOutline}

## Document Content:
${truncatedContent}

## Output:
Generate the mind map JSON now:`
}

/**
 * Parse LLM response to extract JSON
 */
function parseLLMResponse(content: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(content)
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim())
    }

    // Try to find JSON object pattern
    const objectMatch = content.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }

    throw new Error('Failed to extract valid JSON from LLM response')
  }
}

// ===== Main Handler =====

Deno.serve(async (req) => {
  let documentId: string | null = null
  let userId: string | null = null

  try {
    // Parse request body
    const body = await req.json()
    documentId = body.documentId
    userId = body.userId

    if (!documentId || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing documentId or userId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[generate-mindmap] START documentId=${documentId}, userId=${userId}`)

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const llmApiKey = Deno.env.get('LLM')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Update mindmap_status to 'running'
    const { error: updateRunningError } = await supabase
      .from('documents')
      .update({ mindmap_status: 'running', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', userId)

    if (updateRunningError) {
      throw new Error(`Failed to update mindmap_status to running: ${updateRunningError.message}`)
    }

    // Read markdown content from document_contents
    const { data: contentData, error: contentError } = await supabase
      .from('document_contents')
      .select('markdown_content')
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .eq('deleted', 0)
      .single()

    if (contentError || !contentData) {
      throw new Error(
        `Failed to read document content: ${contentError?.message || 'No content found'}`
      )
    }

    const markdownContent: string = contentData.markdown_content || ''

    // If content is too short, set success with empty mindmap and return
    if (markdownContent.length < 50) {
      // Update mindmap_status to success (content too short, no mindmap generated)
      await supabase
        .from('documents')
        .update({ mindmap_status: 'success', updated_at: new Date().toISOString() })
        .eq('id', documentId)
        .eq('user_id', userId)

      // Check if summary_status is also success, if so update documents.status to ready
      const { data: docData } = await supabase
        .from('documents')
        .select('summary_status')
        .eq('id', documentId)
        .eq('user_id', userId)
        .single()

      if (docData?.summary_status === 'success') {
        await supabase
          .from('documents')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('id', documentId)
          .eq('user_id', userId)
      }

      return new Response(
        JSON.stringify({
          success: true,
          mindmap: null,
          message: 'Content too short for mindmap generation'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Extract heading structure from markdown (h1-h6)
    const headings = extractHeadings(markdownContent)
    console.log(
      `[generate-mindmap] Content length=${markdownContent.length}, headings=${headings.length}, calling LLM...`
    )

    // Build prompt for LLM
    const prompt = buildMindmapPrompt(headings, markdownContent)

    // Call MiMo LLM API
    const llmResponse = await fetch('https://token-plan-sgp.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmApiKey}`
      },
      body: JSON.stringify({
        model: 'mimo-v2.5-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    })

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text()
      throw new Error(`LLM API request failed (${llmResponse.status}): ${errorText}`)
    }

    const llmResult = await llmResponse.json()
    const llmContent = llmResult.choices?.[0]?.message?.content

    if (!llmContent) {
      throw new Error('LLM returned empty content')
    }

    // Parse and validate JSON structure
    const mindmapData = parseLLMResponse(llmContent)
    validateMindmapNode(mindmapData)

    // Generate markdown outline from headings
    const markdownOutline = generateMarkdownOutline(headings)

    // Idempotent: delete existing record in document_mindmaps for this document
    await supabase
      .from('document_mindmaps')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    // Insert into document_mindmaps table
    const now = new Date().toISOString()
    const { error: insertError } = await supabase.from('document_mindmaps').insert({
      user_id: userId,
      document_id: documentId,
      mindmap_json: mindmapData,
      markdown_outline: markdownOutline,
      model_name: 'mimo-v2.5-pro',
      deleted: 0,
      generated_at: now,
      created_at: now,
      updated_at: now
    })

    if (insertError) {
      throw new Error(`Failed to save mindmap: ${insertError.message}`)
    }

    // Update documents.mindmap_status = 'success'
    await supabase
      .from('documents')
      .update({ mindmap_status: 'success', updated_at: now })
      .eq('id', documentId)
      .eq('user_id', userId)

    // Check if summary_status is also 'success', if so update documents.status = 'ready'
    const { data: docStatus } = await supabase
      .from('documents')
      .select('summary_status')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()

    if (docStatus?.summary_status === 'success') {
      await supabase
        .from('documents')
        .update({ status: 'ready', updated_at: now })
        .eq('id', documentId)
        .eq('user_id', userId)
    }

    return new Response(JSON.stringify({ success: true, mindmap: mindmapData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    // Failure handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    try {
      if (documentId && userId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const now = new Date().toISOString()

        // Mark mindmap_status as failed only — 不影响文档整体可阅读性
        await supabase
          .from('documents')
          .update({
            mindmap_status: 'failed',
            updated_at: now
          })
          .eq('id', documentId)
          .eq('user_id', userId)

        // Record error in document_processing_jobs
        await supabase.from('document_processing_jobs').insert({
          user_id: userId,
          document_id: documentId,
          job_type: 'generate-mindmap',
          status: 'failed',
          error_message: errorMessage,
          started_at: now,
          finished_at: now,
          deleted: 0,
          created_at: now,
          updated_at: now
        })
      }
    } catch (innerError) {
      // If error handling itself fails, just log and return error response
      console.error('Failed to record error state:', innerError)
    }

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
