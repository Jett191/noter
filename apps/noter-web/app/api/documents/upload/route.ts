import { createClient } from '@/lib/supabase/server'
import { handler } from '@/utils/http/handler'
import { success, error } from '@/utils/http/response'
import { uploadDocumentSchema } from '@/utils/feature/documents/schemas'
import type { Document } from '@/types/document'

/** 根据文件扩展名推断 MIME 类型 */
function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown'
  }
  return mimeMap[ext] ?? 'application/octet-stream'
}

export const POST = handler(async (request: Request) => {
  const supabase = await createClient()

  // 1. 获取认证用户
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return error('未登录', 401)
  }

  // 2. 解析 FormData
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return error('请选择要上传的文件', 400)
  }

  // 3. 校验文件名和大小
  uploadDocumentSchema.parse({
    fileName: file.name,
    fileSize: file.size
  })

  // 4. 提取文件信息
  const originalFilename = file.name
  const fileExt = originalFilename.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = getMimeType(fileExt)
  const title = originalFilename.replace(/\.[^/.]+$/, '') // 去掉扩展名作为标题

  // 5. 生成文档 ID
  const documentId = crypto.randomUUID()

  // 6. 上传文件到 document-originals 桶
  const storagePath = `${user.id}/${documentId}`
  const fileBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('document-originals')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false
    })

  if (uploadError) {
    return error(`文件上传失败: ${uploadError.message}`, 500)
  }

  // 7. 获取 folderId（从 FormData 中）
  const folderId = formData.get('folderId') as string | null

  // 8. 创建文档记录
  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: user.id,
      title,
      original_filename: originalFilename,
      file_ext: fileExt,
      mime_type: mimeType,
      file_size: file.size,
      original_bucket: 'document-originals',
      original_storage_path: storagePath,
      status: 'processing',
      parse_status: 'pending',
      vector_status: 'pending',
      summary_status: 'pending',
      mindmap_status: 'pending',
      folder_id: folderId || null,
    })
    .select()
    .single()

  if (insertError) {
    // 回滚：删除已上传的文件
    await supabase.storage.from('document-originals').remove([storagePath])
    return error(`创建文档记录失败: ${insertError.message}`, 500)
  }

  // 8. 异步触发 parse-document Edge Function（不等待结果）
  supabase.functions.invoke('parse-document', {
    body: {
      documentId,
      userId: user.id,
      storagePath
    }
  })

  // 9. 立即返回创建的文档记录
  const result: Document = {
    id: document.id,
    userId: document.user_id,
    title: document.title,
    originalFilename: document.original_filename,
    fileExt: document.file_ext,
    mimeType: document.mime_type,
    fileSize: document.file_size,
    originalBucket: document.original_bucket,
    originalStoragePath: document.original_storage_path,
    status: document.status,
    parseStatus: document.parse_status,
    vectorStatus: document.vector_status,
    summaryStatus: document.summary_status,
    mindmapStatus: document.mindmap_status,
    shortDescription: document.short_description,
    wordCount: document.word_count,
    pageCount: document.page_count,
    language: document.language,
    isFavorite: document.is_favorite,
    isArchived: document.is_archived,
    deleted: document.deleted,
    folderId: document.folder_id ?? null,
    tags: [],
    createdAt: document.created_at,
    updatedAt: document.updated_at
  }

  return success(result, '文档上传成功', 201)
})
