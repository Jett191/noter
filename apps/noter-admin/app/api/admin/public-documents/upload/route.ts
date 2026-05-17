import 'server-only'

/**
 * Next.js Route Segment Config:
 * - 允许最大 1GB 的请求体(实际由代码层 50MB×20 限制)
 * - 使用 nodejs runtime 以支持大文件上传
 */
export const runtime = 'nodejs'
export const maxDuration = 60 // 秒

/**
 * POST /api/admin/public-documents/upload
 *
 * 公共文档批量上传接口:multipart 解析,单批 ≤20、单文件 ≤50MB,扩展名白名单。
 *
 * 设计参见 design.md §6.2 (公共文档) 与 §7.2 (公共文档上传异步 pipeline):
 *   - 受 requireAdmin() 保护
 *   - 解析 multipart form data (Next.js 内置 request.formData())
 *   - 每个文件流程:
 *       1. INSERT documents 占位行 (document_scope='public', user_id=系统账号 id,
 *          folder_id=系统文件夹 id, status='processing')
 *       2. 上传 Supabase Storage (originals bucket)
 *       3. 失败 → DELETE 占位 + DELETE Storage (补偿事务)
 *       4. 成功 → 触发 triggerFullPipeline (fire-and-forget)
 *   - 立即返回每个文件的 { documentId, fileName, status, pipelineTriggered }
 *   - 写 audit_log: public_document.upload (metadata 含上传管理员 id/email, file_size, file_ext)
 *
 * Requirements: 13
 */

import { withRouteHandler, ValidationError } from '@/lib/http/handler'
import { success } from '@/lib/http/response'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/writeAuditLog'
import { triggerFullPipeline } from '@/lib/pipeline/triggerFullPipeline'

// ─── 常量 ───

const MAX_FILES_PER_BATCH = 20
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'csv',
  'html',
  'htm',
  'epub'
])

/** Storage bucket 名称 */
const STORAGE_BUCKET = 'originals'

// ─── 辅助函数 ───

/**
 * 从文件名中提取扩展名(小写,不含点号)。
 * 无扩展名时返回空字符串。
 */
function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot < 0 || lastDot === fileName.length - 1) return ''
  return fileName.slice(lastDot + 1).toLowerCase()
}

/**
 * 生成 Storage 路径:public-documents/<documentId>/<原始文件名>
 */
function buildStoragePath(documentId: string, fileName: string): string {
  return `public-documents/${documentId}/${fileName}`
}

// ─── 结果类型 ───

interface UploadResult {
  documentId: string | null
  fileName: string
  status: 'processing' | 'failed'
  pipelineTriggered: boolean
  error?: string
}

// ─── Handler ───

async function handler(request: Request): Promise<Response> {
  // ─── 1. 鉴权 ───
  const admin = await requireAdmin()

  // ─── 2. 解析 multipart form data ───
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new ValidationError('无法解析 multipart form data')
  }

  // 提取所有 File 类型的字段(字段名为 "files" 或 "files[]")
  const files: File[] = []
  for (const [, value] of formData.entries()) {
    if (value instanceof File && value.size > 0) {
      files.push(value)
    }
  }

  if (files.length === 0) {
    throw new ValidationError('未提供任何文件')
  }

  // ─── 3. 批量校验 ───
  if (files.length > MAX_FILES_PER_BATCH) {
    throw new ValidationError(`单批最多上传 ${MAX_FILES_PER_BATCH} 个文件,当前 ${files.length} 个`)
  }

  // 逐文件校验大小与扩展名
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `文件 "${file.name}" 超过 50MB 限制 (${(file.size / 1024 / 1024).toFixed(1)}MB)`
      )
    }
    const ext = getFileExtension(file.name)
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      throw new ValidationError(
        `文件 "${file.name}" 的扩展名 "${ext || '(无)'}" 不在白名单中。允许: ${[...ALLOWED_EXTENSIONS].join(', ')}`
      )
    }
  }

  // ─── 4. 获取系统账号 id 与系统文件夹 id ───
  const adminClient = getSupabaseAdmin()

  const { data: systemProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('is_system_account', true)
    .limit(1)
    .single()

  if (profileError || !systemProfile) {
    throw new Error('系统账号不存在,请确认 seed 脚本已执行 (profiles.is_system_account=true)')
  }

  const { data: systemFolder, error: folderError } = await adminClient
    .from('folders')
    .select('id')
    .eq('is_system_folder', true)
    .limit(1)
    .single()

  if (folderError || !systemFolder) {
    throw new Error('系统文件夹不存在,请确认 seed 脚本已执行 (folders.is_system_folder=true)')
  }

  const systemUserId = systemProfile.id as string
  const systemFolderId = systemFolder.id as string

  // ─── 5. 逐文件处理 ───
  const results: UploadResult[] = []

  for (const file of files) {
    const fileName = file.name
    const fileExt = getFileExtension(fileName)
    const fileSize = file.size

    let documentId: string | null = null
    let storagePath: string | null = null

    try {
      // 5a. INSERT documents 占位行
      const { data: inserted, error: insertError } = await adminClient
        .from('documents')
        .insert({
          title: fileName.replace(/\.[^.]+$/, ''), // 去掉扩展名作为标题
          file_name: fileName,
          file_size: fileSize,
          file_type: fileExt,
          document_scope: 'public',
          user_id: systemUserId,
          folder_id: systemFolderId,
          status: 'processing',
          parse_status: 'pending'
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        throw new Error(`INSERT documents 失败: ${insertError?.message ?? 'unknown'}`)
      }

      documentId = inserted.id as string
      storagePath = buildStoragePath(documentId, fileName)

      // 5b. 上传到 Supabase Storage
      const fileBuffer = await file.arrayBuffer()
      const { error: uploadError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        })

      if (uploadError) {
        throw new Error(`Storage 上传失败: ${uploadError.message}`)
      }

      // 5c. 更新 documents 写入 storage_object_path
      const { error: updateError } = await adminClient
        .from('documents')
        .update({ storage_object_path: storagePath })
        .eq('id', documentId)

      if (updateError) {
        // 更新失败也需要回滚
        throw new Error(`UPDATE documents storage_path 失败: ${updateError.message}`)
      }

      // 5d. 触发完整 pipeline (fire-and-forget)
      const pipelineResult = await triggerFullPipeline({
        documentId,
        userId: systemUserId,
        storagePath
      })

      results.push({
        documentId,
        fileName,
        status: 'processing',
        pipelineTriggered: pipelineResult.triggered
      })

      // 5e. 写 audit log (不等待,不影响主响应)
      void writeAuditLog({
        adminUserId: admin.userId,
        adminEmail: admin.email,
        actionType: 'public_document.upload',
        targetResourceType: 'public_document',
        targetResourceId: documentId,
        targetResourceLabel: fileName,
        metadata: {
          file_size: fileSize,
          file_ext: fileExt,
          uploader_admin_id: admin.userId,
          uploader_admin_email: admin.email
        },
        request
      })
    } catch (err) {
      // ─── 补偿事务:回滚 DB 占位 + Storage ───
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[noter-admin][upload] File "${fileName}" failed: ${errMsg}`)

      // 删除 Storage 文件(如果已上传)
      if (storagePath) {
        try {
          await adminClient.storage.from(STORAGE_BUCKET).remove([storagePath])
        } catch (storageCleanErr) {
          console.error(
            `[noter-admin][upload] Storage cleanup failed for "${storagePath}":`,
            storageCleanErr
          )
        }
      }

      // 删除 DB 占位行(如果已插入)
      if (documentId) {
        try {
          await adminClient.from('documents').delete().eq('id', documentId)
        } catch (dbCleanErr) {
          console.error(
            `[noter-admin][upload] DB cleanup failed for documentId="${documentId}":`,
            dbCleanErr
          )
        }
      }

      results.push({
        documentId: null,
        fileName,
        status: 'failed',
        pipelineTriggered: false,
        error: errMsg
      })
    }
  }

  return success({ results }, 200)
}

export const POST = withRouteHandler(handler, { timeoutMs: 60_000 })
