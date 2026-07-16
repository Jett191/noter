/**
 * SummaryTool —— 读 `document_summaries` 结构化字段。
 *
 * 服务于 `/brief`（速览）与 `/actions`（行动项）两个 Skill；这两个 Skill
 * **禁止**调用任何向量/混合搜索（design.md 性能约束 15.1），所以唯一的数据
 * 入口就是这里的 `getSummary`。
 *
 * 关键约束：
 *   1. SQL WHERE 强制 `document_id = :documentId AND user_id = :userId AND deleted = 0`
 *      （requirements 12.5 / 11.7 同文档作用域强制）。
 *   2. 找不到记录、字段缺失、任意 supabase 错误 / env 缺失 / 网络异常 → 一律返回 null，
 *      让上层走降级路径（design.md /brief 与 /actions 的 summary 缺失降级）；
 *      **绝不抛错**（让 Skill Handler 内部 try/catch 复杂化没有意义）。
 *   3. 服务端用 service_role 直读，跨过 RLS；user_id 谓词作为业务级二次校验。
 */

import { getSupabaseServiceClient } from '../db/client'

export interface DocumentSummary {
  /** 文档摘要正文；DB 允许空字符串，列本身在 schema 上不带 nullable，但保守处理为 string | null */
  summary: string | null
  /** 关键要点（DB 为 jsonb）；规范化为 string[]，缺失/非数组/非字符串成员一律剔除 */
  keyPoints: string[]
  /** 关键词（DB 为 text[]）；规范化为 string[] */
  keywords: string[]
  /**
   * 适用场景（DB 为 jsonb，结构未约束）。生成阶段当前写入 null，但 schema 允许任意 jsonb
   * 形状（对象 / 数组 / 字符串），这里**透传原始 jsonb**，由调用方 Skill 决定如何解读，
   * 避免在 Tool 层做有损规范化。
   */
  suitableScenarios: unknown
  /** 待办事项（DB 为 jsonb）；规范化为 string[]，缺失即空数组（/actions 在 todos 缺失时仍走正常路径） */
  todos: string[]
}

/** 把 jsonb / text[] / unknown 规范化为 string[]：非数组返回 [] ，非字符串成员剔除 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * 读取指定文档的摘要结构化字段。
 *
 * @param documentId 文档 ID（已由 Route Handler 校验过归属）
 * @param userId 用户 ID（仍在 SQL 谓词中强制，用于业务级二次校验）
 * @returns 命中且 deleted=0 时返回规范化后的 DocumentSummary；任何异常 / 未命中均返回 null
 */
export async function getSummary(
  documentId: string,
  userId: string
): Promise<DocumentSummary | null> {
  // 入参缺失视为未命中：避免把空字符串作为 SQL 谓词匿名匹配到任何记录（虽然 uuid 列做不到字符串匹配，
  // 但提前 short-circuit 仍能省一次 DB 往返）。
  if (!documentId || !userId) return null

  try {
    const supabase = getSupabaseServiceClient()

    const { data, error } = await supabase
      .from('document_summaries')
      .select('summary, key_points, keywords, suitable_scenarios, todos')
      // 同文档作用域强制（design.md 12.5）：document_id + user_id + deleted=0 三谓词缺一不可
      .eq('document_id', documentId)
      .eq('user_id', userId)
      .eq('deleted', 0)
      // document_summaries.document_id 上有 unique 约束，理论上至多一行；
      // 用 maybeSingle 而非 single：未命中返回 data=null 而非抛 PGRST116 错误，
      // 与 “找不到 → null” 的契约自然贴合。
      .maybeSingle()

    if (error) return null
    if (!data) return null

    return {
      summary: typeof data.summary === 'string' ? data.summary : null,
      keyPoints: normalizeStringArray(data.key_points),
      keywords: normalizeStringArray(data.keywords),
      // jsonb 透传：可能是 null / 对象 / 数组 / 字符串，上层自行解读
      suitableScenarios: data.suitable_scenarios ?? null,
      todos: normalizeStringArray(data.todos)
    }
  } catch {
    // env 缺失（getSupabaseServiceClient throw）/ 网络异常 / supabase-js 内部异常
    // 一律静默降级为 null，让 /brief 与 /actions Skill 走 markdown_prefix + outline 现场提取路径
    return null
  }
}
