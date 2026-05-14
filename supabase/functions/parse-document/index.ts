import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const LLAMA_PARSE_BASE_URL = 'https://api.cloud.llamaindex.ai/api/v2/parse'
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

interface ParseRequest {
  documentId: string
  userId: string
  storagePath: string
}

interface OutlineNode {
  id: string
  level: number
  title: string
  children: OutlineNode[]
}

/**
 * Extract outline (headings h1-h6) from markdown content as a nested JSON structure.
 */
function extractOutline(markdown: string): OutlineNode[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const flatHeadings: { level: number; title: string; id: string }[] = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length
    const title = match[2].trim()
    const id = title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)
    flatHeadings.push({ level, title, id: `${id}-${flatHeadings.length}` })
  }

  // Build nested tree
  const root: OutlineNode[] = []
  const stack: { node: OutlineNode; level: number }[] = []

  for (const heading of flatHeadings) {
    const node: OutlineNode = {
      id: heading.id,
      level: heading.level,
      title: heading.title,
      children: []
    }

    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ node, level: heading.level })
  }

  return root
}

/**
 * Replace image URLs in markdown with Supabase public URLs.
 * On download failure, keep original alt text or insert placeholder.
 */
// deno-lint-ignore no-explicit-any
async function processImages(
  markdown: string,
  images: Array<{ filename: string; presigned_url: string; content_type: string }>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  documentId: string
): Promise<{ processedMarkdown: string; assets: Array<Record<string, unknown>> }> {
  const assets: Array<Record<string, unknown>> = []

  // Build a map of filename -> image info from LlamaParse response
  const imageMap = new Map<string, { presigned_url: string; content_type: string }>()
  for (const img of images) {
    imageMap.set(img.filename, {
      presigned_url: img.presigned_url,
      content_type: img.content_type
    })
  }

  // Find all image references in markdown: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const replacements: Array<{ original: string; replacement: string }> = []
  let imgMatch: RegExpExecArray | null

  while ((imgMatch = imageRegex.exec(markdown)) !== null) {
    const fullMatch = imgMatch[0]
    const altText = imgMatch[1]
    const imageUrl = imgMatch[2]

    // Extract filename from URL or path
    const urlFilename = imageUrl.split('/').pop()?.split('?')[0] || ''

    // Check if this image is in our LlamaParse images list
    const imageInfo = imageMap.get(urlFilename)
    const downloadUrl = imageInfo?.presigned_url || imageUrl

    // Only process URLs that look like external/temporary URLs (not already Supabase URLs)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    if (downloadUrl.includes(supabaseUrl) && !imageInfo) {
      continue // Already a Supabase URL, skip
    }

    try {
      // Download the image
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const imageBuffer = await response.arrayBuffer()
      const contentType =
        imageInfo?.content_type || response.headers.get('content-type') || 'image/png'
      const fileSize = imageBuffer.byteLength

      // Determine filename for storage
      const storageName = urlFilename || `image_${assets.length}.png`
      const storagePath = `${userId}/${documentId}/${storageName}`

      // Upload to document-assets-public bucket
      const { error: uploadError } = await supabase.storage
        .from('document-assets-public')
        .upload(storagePath, imageBuffer, {
          contentType,
          upsert: true
        })

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('document-assets-public')
        .getPublicUrl(storagePath)

      const publicUrl = publicUrlData.publicUrl

      // Record asset
      assets.push({
        user_id: userId,
        document_id: documentId,
        bucket: 'document-assets-public',
        storage_path: storagePath,
        public_url: publicUrl,
        original_url: downloadUrl,
        filename: storageName,
        mime_type: contentType,
        file_size: fileSize,
        sort_order: assets.length,
        deleted: 0
      })

      // Replace in markdown
      replacements.push({
        original: fullMatch,
        replacement: `![${altText}](${publicUrl})`
      })
    } catch {
      // On failure: keep alt text or insert placeholder, never generate empty image link
      const placeholder = altText || '[图片暂时无法显示]'
      replacements.push({
        original: fullMatch,
        replacement: placeholder
      })
    }
  }

  // Apply replacements
  let processedMarkdown = markdown
  for (const { original, replacement } of replacements) {
    processedMarkdown = processedMarkdown.replace(original, replacement)
  }

  return { processedMarkdown, assets }
}

/**
 * Poll LlamaParse job until completion or timeout.
 */
async function pollJobStatus(
  jobId: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ status: string; error?: string }> {
  const startTime = Date.now()
  const pollInterval = 3000 // 3 seconds

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${LLAMA_PARSE_BASE_URL}/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Poll status failed: HTTP ${response.status}`)
    }

    const data = await response.json()
    const status = data.job?.status || data.status

    if (status === 'COMPLETED') {
      return { status: 'COMPLETED' }
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      return {
        status,
        error: data.job?.error_message || data.error_message || 'Job failed'
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  return { status: 'TIMEOUT', error: 'LlamaParse job timed out' }
}

Deno.serve(async (req) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const llamaParseKey = Deno.env.get('LlamaParse')!

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let body: ParseRequest

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { documentId, userId, storagePath } = body

  if (!documentId || !userId || !storagePath) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: documentId, userId, storagePath' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  console.log(
    `[parse-document] START documentId=${documentId}, userId=${userId}, storagePath=${storagePath}`
  )

  // Record job start
  const jobStartedAt = new Date().toISOString()

  try {
    // Step 1: Update parse_status to 'running'
    await supabase
      .from('documents')
      .update({ parse_status: 'running', updated_at: new Date().toISOString() })
      .eq('id', documentId)

    // Record processing job
    await supabase.from('document_processing_jobs').insert({
      user_id: userId,
      document_id: documentId,
      job_type: 'parse-document',
      status: 'running',
      input_payload: { documentId, userId, storagePath },
      started_at: jobStartedAt,
      deleted: 0
    })

    // Step 2: Generate signed URL from document-originals bucket (1 hour expiry)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('document-originals')
      .createSignedUrl(storagePath, 3600) // 1 hour = 3600 seconds

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(
        `Failed to create signed URL: ${signedUrlError?.message || 'No URL returned'}`
      )
    }

    const signedUrl = signedUrlData.signedUrl
    console.log(`[parse-document] Step 2: Signed URL created successfully`)

    // Step 3: Submit parse job to LlamaParse v2 API
    const parseResponse = await fetch(LLAMA_PARSE_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llamaParseKey}`,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        source_url: signedUrl,
        tier: 'agentic',
        version: 'latest',
        output_options: {
          images_to_save: ['embedded']
        }
      })
    })

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text()
      throw new Error(`LlamaParse upload failed: HTTP ${parseResponse.status} - ${errorText}`)
    }

    const parseData = await parseResponse.json()
    const jobId = parseData.job?.id || parseData.id

    if (!jobId) {
      throw new Error('LlamaParse did not return a job ID')
    }

    console.log(`[parse-document] Step 3: LlamaParse job submitted, jobId=${jobId}`)

    // Step 4: Poll for job completion
    const pollResult = await pollJobStatus(jobId, llamaParseKey, TIMEOUT_MS - 30000) // Reserve 30s for post-processing

    if (pollResult.status !== 'COMPLETED') {
      throw new Error(pollResult.error || `LlamaParse job status: ${pollResult.status}`)
    }

    console.log(`[parse-document] Step 4: LlamaParse job completed`)

    // Step 5: Retrieve markdown result with expand=markdown_full,images_content_metadata
    const resultResponse = await fetch(
      `${LLAMA_PARSE_BASE_URL}/${jobId}?expand=markdown_full,images_content_metadata`,
      {
        headers: {
          Authorization: `Bearer ${llamaParseKey}`,
          accept: 'application/json'
        }
      }
    )

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text()
      throw new Error(
        `Failed to retrieve parse result: HTTP ${resultResponse.status} - ${errorText}`
      )
    }

    const resultData = await resultResponse.json()

    // Extract markdown content
    const markdownContent = resultData.markdown_full || ''

    if (!markdownContent) {
      throw new Error('LlamaParse returned empty markdown content')
    }

    console.log(`[parse-document] Step 5: Markdown retrieved, length=${markdownContent.length}`)

    // Extract images list
    const imagesMetadata = resultData.images_content_metadata?.images || []

    // Step 6: Process images - download, upload to Supabase, replace URLs
    const { processedMarkdown, assets } = await processImages(
      markdownContent,
      imagesMetadata,
      supabase,
      userId,
      documentId
    )

    // Step 7: Insert document assets records
    if (assets.length > 0) {
      const { error: assetsError } = await supabase.from('document_assets').insert(assets)

      if (assetsError) {
        console.error('Failed to insert document assets:', assetsError.message)
        // Non-fatal: continue with the rest of the process
      }
    }

    // Step 8: Extract outline from markdown headings
    const outline = extractOutline(processedMarkdown)
    console.log(
      `[parse-document] Step 6-8: Images processed (${assets.length}), outline extracted (${outline.length} nodes)`
    )

    // Step 9: Save standardized markdown to document_contents table
    // First check if a record already exists (for idempotency)
    const { data: existingContent } = await supabase
      .from('document_contents')
      .select('id')
      .eq('document_id', documentId)
      .eq('deleted', 0)
      .single()

    if (existingContent) {
      // Update existing record
      await supabase
        .from('document_contents')
        .update({
          markdown_content: processedMarkdown,
          outline,
          metadata: {
            llama_parse_job_id: jobId,
            image_count: assets.length,
            parsed_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', existingContent.id)
    } else {
      // Insert new record
      await supabase.from('document_contents').insert({
        user_id: userId,
        document_id: documentId,
        markdown_content: processedMarkdown,
        outline,
        metadata: {
          llama_parse_job_id: jobId,
          image_count: assets.length,
          parsed_at: new Date().toISOString()
        },
        deleted: 0
      })
    }

    // Step 10: Update document word count and parse_status to 'success'
    const wordCount = processedMarkdown.replace(/\s+/g, ' ').trim().length
    await supabase
      .from('documents')
      .update({
        parse_status: 'success',
        word_count: wordCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)

    // Update processing job to success
    await supabase
      .from('document_processing_jobs')
      .update({
        status: 'success',
        output_payload: {
          markdown_length: processedMarkdown.length,
          image_count: assets.length,
          outline_count: outline.length
        },
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('document_id', documentId)
      .eq('job_type', 'parse-document')
      .eq('status', 'running')

    // Step 11: Chain-trigger vectorize-document Edge Function
    console.log(`[parse-document] Step 10: parse_status=success, triggering vectorize-document`)
    try {
      await supabase.functions.invoke('vectorize-document', {
        body: { documentId, userId }
      })
      console.log(`[parse-document] Step 11: vectorize-document triggered successfully`)
    } catch (chainError) {
      console.error('[parse-document] Failed to trigger vectorize-document:', chainError)
      // Non-fatal: parse itself succeeded
    }

    console.log(`[parse-document] DONE documentId=${documentId}`)
    return new Response(JSON.stringify({ success: true, documentId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    // On failure: mark parse_status = 'failed', documents.status = 'failed'
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('parse-document failed:', errorMessage)

    await supabase
      .from('documents')
      .update({
        parse_status: 'failed',
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)

    // Update processing job to failed
    await supabase
      .from('document_processing_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('document_id', documentId)
      .eq('job_type', 'parse-document')
      .eq('status', 'running')

    // If no running job was found, insert a failed record
    const { data: existingJob } = await supabase
      .from('document_processing_jobs')
      .select('id')
      .eq('document_id', documentId)
      .eq('job_type', 'parse-document')
      .single()

    if (!existingJob) {
      await supabase.from('document_processing_jobs').insert({
        user_id: userId,
        document_id: documentId,
        job_type: 'parse-document',
        status: 'failed',
        input_payload: { documentId, userId, storagePath },
        error_message: errorMessage,
        started_at: jobStartedAt,
        finished_at: new Date().toISOString(),
        deleted: 0
      })
    }

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
