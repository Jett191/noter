/**
 * `/explain` Prompt 模板。
 *
 * 两种 prompt 形态：
 *
 *   1. `buildExplainPrompt(concept, hits)`
 *      —— 文档相关位置 ≥ 1 命中时使用；要求 LLM 严格输出 `{ "markdown": "..." }`，
 *         markdown 为 100-300 字、贴合本文相关位置的清晰定义。
 *         **references 由 Skill 侧用 chunk hits 拼装、不让 LLM 编造引用**，
 *         因此 prompt 明确禁止 LLM 自行写 chunkId / 来源标注。
 *
 *   2. `buildFallbackExplainPrompt(concept)`
 *      —— 0 命中降级；LLM 给出**通用领域**解释（与文档无关）。
 *         直接返回 markdown 文本（不走 JSON 模式）；Skill 侧再在最前面拼接
 *         「⚠️ 此解释非来自当前文档：」标注后投递给前端。
 *
 * 与 design.md「`/explain` — 概念释疑」段落一致。
 *
 * Validates: Requirements 5.4, 5.5, 5.7, 5.9
 */

import type { LLMMessage } from '../tools/llm'
import type { ChunkHit } from '../types/tool'

const SYSTEM_PROMPT = [
  '你是 Noter 文档解释助手。基于下方提供的「文档相关位置」内容，针对用户给出的概念输出一段贴合本文的解释。',
  '',
  '严格要求：',
  '1. 仅输出一个 JSON 对象：{"markdown": "..."}；不要 markdown 代码块包裹、不要解释性前后缀。',
  '2. markdown 字段长度控制在 100-300 个汉字之间，可使用 markdown 列表 / 加粗 / 行内代码等基础语法。',
  '3. 解释必须**贴合提供的文档相关位置**；可在解释中提及 1-3 个本文出现的关联概念。',
  '4. **不要**在 markdown 中编造或标注引用（如「chunk 12」「[1]」「来源：xx」），引用由系统侧从检索结果中拼装并独立投递，与你的输出分离。',
  '5. 若文档相关位置与概念关联较弱，仍尽量基于现有材料给出贴合解释；不要凭空生成超出材料的事实。'
].join('\n')

const FALLBACK_SYSTEM_PROMPT = [
  '你是 Noter 概念解释助手。**当前文档中未直接讨论用户给出的概念**，请仅基于通用领域知识给出解释。',
  '',
  '严格要求：',
  '1. 直接输出 markdown 文本（不要 JSON 包裹、不要代码块包裹）。',
  '2. 长度 100-300 个汉字之间，可使用 markdown 列表 / 加粗 / 行内代码等基础语法。',
  '3. 不要假设这是当前文档中的内容；解释中不要出现「本文」「文档」等暗示文档来源的措辞。',
  '4. 不要编造引用或来源标注。'
].join('\n')

/**
 * 把命中的 ChunkHit 列表渲染成 prompt 中的「文档相关位置」段。
 * 每条形如：
 *
 *   [n] 章节：A / B / C
 *   内容：<chunk content>
 *
 * 章节路径为空时退化为「(无章节)」。
 */
function renderReferences(hits: readonly ChunkHit[]): string {
  if (hits.length === 0) return '(无)'
  return hits
    .map((hit, i) => {
      const heading = hit.headingPath.length > 0 ? hit.headingPath.join(' / ') : '(无章节)'
      return `[${i + 1}] 章节：${heading}\n内容：${hit.content}`
    })
    .join('\n\n')
}

/**
 * 命中态 prompt：要求 LLM 输出 `{ markdown: string }`；references 不由 LLM 生成。
 */
export function buildExplainPrompt(concept: string, hits: readonly ChunkHit[]): LLMMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: ['[CONCEPT]', concept, '', '[DOCUMENT_REFERENCES]', renderReferences(hits)].join(
        '\n'
      )
    }
  ]
}

/**
 * 0 命中降级 prompt：LLM 给通用解释，直接以 markdown 文本返回（非 JSON 模式）。
 * Skill 侧会在返回内容前拼接「⚠️ 此解释非来自当前文档：」前缀。
 */
export function buildFallbackExplainPrompt(concept: string): LLMMessage[] {
  return [
    { role: 'system', content: FALLBACK_SYSTEM_PROMPT },
    { role: 'user', content: `请解释概念："${concept}"` }
  ]
}

/**
 * 历史占位导出（保持向后兼容；不再被引用，可在后续清理中移除）。
 */
export const explainPrompt = ''
