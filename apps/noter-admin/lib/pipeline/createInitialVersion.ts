import 'server-only'

/**
 * Noter Admin · 为公共文档创建初始版本记录 (version_no=1)
 *
 * 设计参见 design.md §6.2 / tasks.md 6.3:
 *   - 当 pipeline 解析公共文档并生成 markdown_content 后,需要自动在
 *     public_document_versions 中创建 version_no=1 的初始版本记录。
 *   - 主要由数据库触发器 (trg_auto_create_public_doc_version_v1) 在
 *     document_contents INSERT 时自动完成。
 *   - 本函数作为补充/fallback,可在以下场景手动调用:
 *       1. document_contents 是 UPDATE 而非 INSERT(重新解析场景）
 *       2. 触发器因某种原因未执行
 *       3. 需要在应用层显式确保初始版本存在
 *
 * 幂等性:
 *   - 如果 version_no=1 已存在,函数不会重复创建,返回 { created: false }
 *
 * 调用方:
 *   - 可选:POST /api/admin/public-documents/upload 的后续回调
 *   - 可选:pipeline 完成后的 webhook/polling 逻辑
 */

import { getSupabaseAdmin } from '../supabase/admin'

export interface CreateInitialVersionInput {
  documentId: string
  /** markdown 内容;如果不传,会从 document_contents 中读取 */
  markdownContent?: string
}

export interface CreateInitialVersionResult {
  /** 是否成功创建了初始版本 */
  created: boolean
  /** 如果未创建,说明原因 */
  reason?: 'already_exists' | 'not_public' | 'no_content' | 'no_system_account'
  /** 创建失败时的错误信息 */
  error?: string
}

/**
 * 为公共文档创建初始版本记录 (version_no=1)。
 * 幂等:如果已存在则跳过。
 */
export async function createInitialVersion(
  input: CreateInitialVersionInput
): Promise<CreateInitialVersionResult> {
  const supabase = getSupabaseAdmin()

  try {
    // 1. 检查文档是否为公共文档
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, document_scope, user_id')
      .eq('id', input.documentId)
      .single()

    if (docError || !doc) {
      return { created: false, error: docError?.message || 'Document not found' }
    }

    if (doc.document_scope !== 'public') {
      return { created: false, reason: 'not_public' }
    }

    // 2. 检查是否已存在版本记录
    const { data: existingVersion } = await supabase
      .from('public_document_versions')
      .select('id')
      .eq('document_id', input.documentId)
      .limit(1)
      .single()

    if (existingVersion) {
      return { created: false, reason: 'already_exists' }
    }

    // 3. 获取 markdown 内容
    let markdownContent = input.markdownContent
    if (!markdownContent) {
      const { data: content, error: contentError } = await supabase
        .from('document_contents')
        .select('markdown_content')
        .eq('document_id', input.documentId)
        .eq('deleted', 0)
        .single()

      if (contentError || !content?.markdown_content) {
        return { created: false, reason: 'no_content' }
      }
      markdownContent = content.markdown_content
    }

    // 4. 获取系统账号 id
    const { data: systemAccount } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_system_account', true)
      .limit(1)
      .single()

    // fallback: 使用文档的 user_id(公共文档场景下即系统账号)
    const editorUserId = systemAccount?.id || doc.user_id

    if (!editorUserId) {
      return { created: false, reason: 'no_system_account' }
    }

    // 5. 插入初始版本记录
    const { error: insertError } = await supabase.from('public_document_versions').insert({
      document_id: input.documentId,
      version_no: 1,
      markdown_content: markdownContent,
      change_note: '初始版本(pipeline 解析生成)',
      editor_user_id: editorUserId
    })

    if (insertError) {
      // 唯一约束冲突 = 已存在,视为幂等成功
      if (insertError.code === '23505') {
        return { created: false, reason: 'already_exists' }
      }
      return { created: false, error: insertError.message }
    }

    console.info(
      `[noter-admin][pipeline] Initial version (v1) created for public document: documentId=${input.documentId}`
    )
    return { created: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[noter-admin][pipeline] Failed to create initial version: documentId=${input.documentId}, error=${msg}`
    )
    return { created: false, error: msg }
  }
}
