import 'server-only'

/**
 * Noter Admin · 触发派生 pipeline（跳过解析）
 *
 * 设计参见 design.md §3 (Components) / §7.3 / §7.4:
 *   - 派生 pipeline = 分片 → 向量化 → AI 总结 → 思维导图
 *   - 跳过 parse-document,直接调用 vectorize-document Edge Function
 *   - vectorize-document 内部会:
 *       1. 删除现有 document_chunks
 *       2. 从 document_contents.markdown_content 重新分片
 *       3. 批量 embedding
 *       4. 链式触发 generate-summary + generate-mindmap（并行）
 *     因此本封装仅触发 vectorize-document 即可驱动完整派生链。
 *
 * 关键不变量:
 *   1. 不等待 pipeline 完成。Edge Function 同步入口会返回 200/500;
 *      调用方立即返回给前端 status=processing,前端通过轮询获知最终结果。
 *   2. 触发失败永远不抛错给主响应。失败时:
 *        - 把 documents.status 标 'failed'
 *        - 仅 console.error 记录,主响应仍按 processing 返回
 *   3. 输入参数与 supabase/functions/vectorize-document/index.ts 严格一致:
 *        { documentId, userId }
 *
 * 调用方:
 *   - PUT /api/admin/public-documents/[id]/content (task 7.1 在线编辑)
 *   - POST /api/admin/public-documents/[id]/versions/[versionNo]/rollback (task 7.4 版本回滚)
 */

import { getSupabaseAdmin } from '../supabase/admin'

export interface TriggerDerivativePipelineInput {
  documentId: string
  /** 文档归属用户 id（公共文档场景下为系统账号 id） */
  userId: string
}

export interface TriggerDerivativePipelineResult {
  /** 触发是否成功（成功仅意味着 Edge Function 已被调用,不代表 pipeline 全部完成） */
  triggered: boolean
  /** 触发失败时的错误信息（脱敏） */
  error?: string
}

/**
 * 触发 vectorize-document Edge Function,异步驱动派生 pipeline（跳过解析）。
 *
 * 流程:
 *   vectorize-document 读取 document_contents.markdown_content →
 *   删旧 chunks → 重分片 → 重 embedding →
 *   链式触发 generate-summary + generate-mindmap
 *
 * 注意:虽然函数签名是 async,但内部实现 fire-and-forget:
 *   - 我们 await Edge Function 的入口响应（确认 invoke 已调度）
 *   - Edge Function 会自身链式触发后续步骤,我们不再等待
 * 调用方应使用 `void triggerDerivativePipeline(...)` 或在 Route Handler 中
 * 启动后立即返回 processing 状态。
 */
export async function triggerDerivativePipeline(
  input: TriggerDerivativePipelineInput
): Promise<TriggerDerivativePipelineResult> {
  const supabase = getSupabaseAdmin()
  try {
    const { error: invokeError } = await supabase.functions.invoke('vectorize-document', {
      body: {
        documentId: input.documentId,
        userId: input.userId
      }
    })

    if (invokeError) {
      console.error(
        `[noter-admin][pipeline] vectorize-document invoke failed: documentId=${input.documentId}, error=${invokeError.message}`
      )
      await markDocumentFailed(supabase, input.documentId, invokeError.message)
      return { triggered: false, error: invokeError.message }
    }

    console.info(
      `[noter-admin][pipeline] vectorize-document (derivative) triggered: documentId=${input.documentId}`
    )
    return { triggered: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[noter-admin][pipeline] vectorize-document unexpected exception: documentId=${input.documentId}, error=${msg}`
    )
    await markDocumentFailed(supabase, input.documentId, msg)
    return { triggered: false, error: msg }
  }
}

/**
 * 标记文档状态为 failed。
 * 仅标记 documents.status,不标记 parse_status（因为派生 pipeline 不涉及解析）。
 */
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
