'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeSlug from 'rehype-slug'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { TemplateConfig } from '@/types/template'

interface BaseMarkdownRendererProps {
  content: string
  config: TemplateConfig
}

export function BaseMarkdownRenderer({ content, config }: BaseMarkdownRendererProps) {
  return (
    <article className={config.wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeSlug]}
        components={config.components}>
        {content}
      </ReactMarkdown>
    </article>
  )
}
