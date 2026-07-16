// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LLM_API_KEY = Deno.env.get('LLM')!

const LLM_ENDPOINT = 'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions'
const LLM_MODEL = 'mimo-v2.5-pro'
const MIN_CONTENT_LENGTH = 50

interface SummaryResult {
  summary: string
  key_points: string[]
  keywords: string[]
}

Deno.serve(async (req) => {
  let documentId: string | undefined
  let userId: string | undefined

  try {
    const body = await req.json()
    documentId = body.documentId
    userId = body.userId

    if (!documentId || !userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing documentId or userId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[generate-summary] START documentId=${documentId}, userId=${userId}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Update summary_status to 'running'
    const { error: statusError } = await supabase
      .from('documents')
      .update({ summary_status: 'running', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', userId)

    if (statusError) {
      throw new Error(`Failed to update summary_status: ${statusError.message}`)
    }

    // Create/update processing job record
    const jobStartedAt = new Date().toISOString()
    const { data: existingJob } = await supabase
      .from('document_processing_jobs')
      .select('id')
      .eq('document_id', documentId)
      .eq('job_type', 'generate-summary')
      .eq('deleted', 0)
      .single()

    if (existingJob) {
      await supabase
        .from('document_processing_jobs')
        .update({
          status: 'running',
          started_at: jobStartedAt,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingJob.id)
    } else {
      await supabase.from('document_processing_jobs').insert({
        user_id: userId,
        document_id: documentId,
        job_type: 'generate-summary',
        status: 'running',
        input_payload: { documentId, userId },
        started_at: jobStartedAt,
        deleted: 0
      })
    }

    // Read markdown content from document_contents
    const { data: contentData, error: contentError } = await supabase
      .from('document_contents')
      .select('markdown_content')
      .eq('document_id', documentId)
      .eq('deleted', 0)
      .single()

    if (contentError || !contentData) {
      throw new Error(
        `Failed to read document content: ${contentError?.message || 'No content found'}`
      )
    }

    const markdownContent = contentData.markdown_content || ''

    // If content is too short, set success with empty summary
    if (markdownContent.length < MIN_CONTENT_LENGTH) {
      // Delete existing summary record (idempotent)
      await supabase.from('document_summaries').delete().eq('document_id', documentId)

      // Insert empty summary
      await supabase.from('document_summaries').insert({
        user_id: userId,
        document_id: documentId,
        summary: '',
        key_points: [],
        keywords: [],
        todos: [],
        suitable_scenarios: null,
        model_name: LLM_MODEL,
        deleted: 0,
        generated_at: new Date().toISOString()
      })

      // Update summary_status to success
      await supabase
        .from('documents')
        .update({ summary_status: 'success', updated_at: new Date().toISOString() })
        .eq('id', documentId)
        .eq('user_id', userId)

      // Check if mindmap_status is also success, if so update status to ready
      await checkAndUpdateDocumentReady(supabase, documentId, userId)

      // Update job status
      await updateJobStatus(supabase, documentId, 'success')

      return new Response(
        JSON.stringify({
          success: true,
          summary: { summary: '', key_points: [], keywords: [] }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Call LLM API to generate summary
    console.log(`[generate-summary] Content length=${markdownContent.length}, calling LLM...`)
    const summaryResult = await callLLM(markdownContent)
    console.log(
      `[generate-summary] LLM response received, summary length=${summaryResult.summary.length}`
    )

    // Delete existing summary record (idempotent)
    await supabase.from('document_summaries').delete().eq('document_id', documentId)

    // Insert new summary into document_summaries
    const { error: insertError } = await supabase.from('document_summaries').insert({
      user_id: userId,
      document_id: documentId,
      summary: summaryResult.summary,
      key_points: summaryResult.key_points,
      keywords: summaryResult.keywords,
      todos: [],
      suitable_scenarios: null,
      model_name: LLM_MODEL,
      deleted: 0,
      generated_at: new Date().toISOString()
    })

    if (insertError) {
      throw new Error(`Failed to insert summary: ${insertError.message}`)
    }

    // Update summary_status to success
    const { error: successError } = await supabase
      .from('documents')
      .update({ summary_status: 'success', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', userId)

    if (successError) {
      throw new Error(`Failed to update summary_status to success: ${successError.message}`)
    }

    // Check if mindmap_status is also success, if so update documents.status to ready
    await checkAndUpdateDocumentReady(supabase, documentId, userId)

    // Update job status to success
    await updateJobStatus(supabase, documentId, 'success')

    return new Response(JSON.stringify({ success: true, summary: summaryResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('generate-summary error:', errorMessage)

    // Attempt to mark failure in database
    try {
      if (documentId && userId) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // Mark summary_status as failed only — 不影响文档整体可阅读性
        await supabase
          .from('documents')
          .update({
            summary_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId)
          .eq('user_id', userId)

        // Record error in processing job
        await updateJobStatus(supabase, documentId, 'failed', errorMessage)
      }
    } catch (dbError) {
      console.error('Failed to record error status in database:', dbError)
    }

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Call the MiMo LLM API to generate a document summary.
 */
async function callLLM(markdownContent: string): Promise<SummaryResult> {
  // Truncate content if too long to fit in context (keep first ~8000 chars)
  const truncatedContent =
    markdownContent.length > 8000
      ? markdownContent.slice(0, 8000) + '\n...(内容已截断)'
      : markdownContent

  const prompt = `你是一个专业的文档分析助手。请阅读以下文档内容，生成结构化的文档总结。

要求：
1. summary：核心摘要，不超过 200 字，概括文档的主要内容和核心观点
2. key_points：关键要点列表，不超过 5 条，每条简洁明了
3. keywords：关键词列表，提取文档中最重要的 3-8 个关键词

请严格按照以下 JSON 格式返回，不要包含任何其他文字：
{
  "summary": "核心摘要文本",
  "key_points": ["要点1", "要点2", "要点3"],
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

文档内容：
${truncatedContent}`

  const response = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('LLM returned empty response')
  }

  // Parse JSON from LLM response (handle potential markdown code blocks)
  const jsonStr = extractJSON(content)
  const parsed = JSON.parse(jsonStr)

  // Validate and normalize the result
  const result: SummaryResult = {
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '',
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((p: unknown) => typeof p === 'string').slice(0, 5)
      : [],
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown) => typeof k === 'string').slice(0, 8)
      : []
  }

  return result
}

/**
 * Extract JSON from LLM response that might be wrapped in markdown code blocks.
 */
function extractJSON(content: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find JSON object directly
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  return content.trim()
}

/**
 * Check if both summary_status and mindmap_status are 'success',
 * if so update documents.status to 'ready'.
 */
async function checkAndUpdateDocumentReady(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  userId: string
) {
  const { data: doc } = await supabase
    .from('documents')
    .select('mindmap_status')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (doc && doc.mindmap_status === 'success') {
    await supabase
      .from('documents')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('user_id', userId)
  }
}

/**
 * Update the processing job status for generate-summary.
 */
async function updateJobStatus(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  status: string,
  errorMessage?: string
) {
  const updateData: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  if (errorMessage) {
    updateData.error_message = errorMessage
  }

  await supabase
    .from('document_processing_jobs')
    .update(updateData)
    .eq('document_id', documentId)
    .eq('job_type', 'generate-summary')
    .eq('deleted', 0)
}
