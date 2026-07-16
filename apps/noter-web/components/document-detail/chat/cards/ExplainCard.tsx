'use client'

/**
 * ExplainCard —— `/explain` Skill 输出的结构化卡片（Task 13.3）。
 *
 * 设计参考：
 *   • `.kiro/specs/noter-agent/design.md` 「Frontend Interaction Design / 结构化卡片消息」
 *     与「Skills 详细设计 / `/explain`」段落
 *   • `.kiro/specs/noter-agent/requirements.md` 5.5 / 5.6 / 10.4
 *
 * 渲染契约：
 *   • 顶部标题展示「💡 {concept}」；后端 0 命中降级时 markdown 已以
 *     「⚠️ 此解释非来自当前文档：」开头，前端不再额外标注，避免双重提示
 *   • markdown 用 react-markdown + remark-gfm 渲染（与 ChatMessage 风格一致）
 *   • references 使用原生 `<details>` 折叠区，避免引入新组件；折叠区头部
 *     显示条目数量（例：`📚 引用片段 (3)`），展开后逐条展示 chunkId、
 *     headingPath（用 ` → ` 连接）与 snippet
 *   • references 为空时（0 命中降级）整个折叠区不渲染
 *
 * Props 与 payload 字段与 `ExplainPayload`（types/agent.ts）保持一致；
 * references 中的 chunkId / headingPath / snippet 由后端保证真实存在
 * （Property 5: `/explain` 引用片段完整性）。
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@noter/ui/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'

import type { ExplainPayload, ExplainReference } from '@/types/agent'

export interface ExplainCardProps {
  payload: ExplainPayload
}

export function ExplainCard({ payload }: ExplainCardProps) {
  const { concept, markdown, references } = payload
  const hasReferences = references && references.length > 0

  return (
    <Card size='sm' className='w-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <span aria-hidden='true'>💡</span>
          <span className='break-words'>{concept}</span>
        </CardTitle>
      </CardHeader>

      <CardContent
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none',
          '[&_li]:my-0.5 [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1',
          '[&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-black/5 [&_pre]:p-2',
          '[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs'
        )}>
        {markdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        ) : (
          <span className='text-muted-foreground/60'>（暂无解释内容）</span>
        )}
      </CardContent>

      {hasReferences ? (
        <CardContent>
          <details className='group/refs border-border bg-muted/30 rounded-md border'>
            <summary
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium select-none',
                'text-muted-foreground hover:text-foreground',
                'list-none [&::-webkit-details-marker]:hidden'
              )}>
              <span
                aria-hidden='true'
                className='inline-block transition-transform group-open/refs:rotate-90'>
                ▸
              </span>
              <span>📚 引用片段</span>
              <span className='text-muted-foreground/70'>({references.length})</span>
            </summary>

            <ul className='border-border/60 border-t px-3 py-2'>
              {references.map((ref, index) => (
                <ReferenceItem key={ref.chunkId ?? index} reference={ref} index={index} />
              ))}
            </ul>
          </details>
        </CardContent>
      ) : null}
    </Card>
  )
}

interface ReferenceItemProps {
  reference: ExplainReference
  index: number
}

function ReferenceItem({ reference, index }: ReferenceItemProps) {
  const { chunkId, headingPath, snippet } = reference
  const headingLabel =
    headingPath && headingPath.length > 0 ? headingPath.join(' → ') : '(未命名章节)'

  return (
    <li className={cn('py-2 text-xs leading-relaxed', index > 0 && 'border-border/40 border-t')}>
      <div className='mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
        <span className='text-muted-foreground/70 font-mono text-[10px]'>#{index + 1}</span>
        <span className='text-foreground font-medium break-all'>{headingLabel}</span>
      </div>
      <div className='text-muted-foreground/60 mb-1 font-mono text-[10px] break-all'>
        chunk: {chunkId}
      </div>
      <p className='text-muted-foreground break-words whitespace-pre-wrap'>{snippet}</p>
    </li>
  )
}
