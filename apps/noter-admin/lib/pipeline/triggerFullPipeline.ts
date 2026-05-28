import 'server-only'

/**
 * Noter Admin · 触发完整 RAG pipeline
 *
 * 设计参见 design.md §3 (Components) / §6.2 / §7.2 (公共文档上传):
 *   - 完整 pipeline = 解析 → 分片 → 向量化 → AI 总结 → 思维导图
 *   - 链式触发由现有 Edge Function 内部完成:
 *       parse-document → vectorize-document → (generate-summary || generate-mindmap)
 *     本封装仅触发链头 parse-document。
 *
 * 关键不变量:
 *   1. 不等待 pipeline 完成。Edge Function 同步入口会返回 200/202;调用方立即返回
 *      给前端 status=processing,前端通过轮询 documents.status 获知最终结果。
 *   2. 触发失败永远不抛错给主响应。失败时:
 *        - 把 documents.status 与 documents.parse_status 标 'failed'
 *        - 仅 console.error 记录,主响应仍按 processing 返回(前端轮询会自然发现 failed)
 *   3. 输入参数与 supabase/functions/parse-document/index.ts 的 ParseRequest 严格一致:
 *        { documentId, userId, storagePath }
 *
 * 调用方:
 *   - POST /api/admin/public-documents/upload (task 6.2)
 */

import { getSupabaseAdmin } from '../supabase/admin'

export interface TriggerFullPipelineInput {
  documentId: string
  /** 系统账号 id(公共文档场景下文档归属系统账号) */
  userId: string
  /** Supabase Storage 路径(originals bucket 内) */
  storagePath: string
}

export interface TriggerFullPipelineResult {
  /** 触发是否成功(成功仅意味着 Edge Function 已被调用,不代表 pipeline 全部完成) */
  triggered: boolean
  /** 触发失败时的错误信息(脱敏) */
  error?: string
}

/**
 * 触发 parse-document Edge Function,异步驱动完整 RAG pipeline。
 *
 * 注意:虽然函数签名是 async,但内部实现 fire-and-forget:
 *   - 我们 await Edge Function 的入口响应(确认 invoke 已调度)
 *   - Edge Function 会自身链式触发后续步骤,我们不再等待
 * 调用方应使用 `void triggerFullPipeline(...)` 或在 Route Handler 中
 * 启动后立即返回 processing 状态。
 */
export async function triggerFullPipeline(
  input: TriggerFullPipelineInput
): Promise<TriggerFullPipelineResult> {
  const supabase = getSupabaseAdmin()
  try {
    const { error: invokeError } = await supabase.functions.invoke('parse-document', {
      body: {
        documentId: input.documentId,
        userId: input.userId,
        storagePath: input.storagePath
      }
    })

    if (invokeError) {
      console.error(
        `[noter-admin][pipeline] parse-document invoke failed: documentId=${input.documentId}, error=${invokeError.message}`
      )
      await markDocumentFailed(supabase, input.documentId, invokeError.message)
      return { triggered: false, error: invokeError.message }
    }

    console.info(`[noter-admin][pipeline] parse-document triggered: documentId=${input.documentId}`)
    return { triggered: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[noter-admin][pipeline] parse-document unexpected exception: documentId=${input.documentId}, error=${msg}`
    )
    await markDocumentFailed(supabase, input.documentId, msg)
    return { triggered: false, error: msg }
  }
}

async function markDocumentFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentId: string,
  reason: string
): Promise<void> {
  try {
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        parse_status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[noter-admin][pipeline] failed to mark document failed: documentId=${documentId}, reason=${reason}, dbError=${msg}`
    )
  }
}
