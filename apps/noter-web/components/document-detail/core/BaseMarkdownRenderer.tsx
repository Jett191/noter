'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import type { TemplateConfig } from '@/types/template'

interface BaseMarkdownRendererProps {
  content: string
  config: TemplateConfig
}

export function BaseMarkdownRenderer({ content, config }: BaseMarkdownRendererProps) {
  return (
    <article className={config.wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={config.components}>
        {content}
      </ReactMarkdown>
    </article>
  )
}
