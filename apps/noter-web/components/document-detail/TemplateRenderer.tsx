'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import type { TemplateType } from '@/types/document'

interface TemplateRendererProps {
  markdownContent: string
  template: TemplateType
}

/**
 * 模板样式配置
 * 每种模板预定义字体、字号、行高、段落间距、标题样式、代码块样式、引用块样式
 */
const templateStyles: Record<TemplateType, string> = {
  default: [
    // 基础 prose 样式：标准可读风格
    'prose prose-neutral dark:prose-invert max-w-none',
    // 字体：系统默认无衬线
    'font-sans',
    // 字号与行高：正常
    'text-base leading-7',
    // 段落间距
    'prose-p:my-4',
    // 标题样式
    'prose-headings:font-semibold prose-headings:tracking-tight',
    'prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4',
    'prose-h2:text-2xl prose-h2:mt-6 prose-h2:mb-3',
    'prose-h3:text-xl prose-h3:mt-5 prose-h3:mb-2',
    'prose-h4:text-lg prose-h4:mt-4 prose-h4:mb-2',
    // 代码块样式
    'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4',
    'prose-code:text-sm prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
    // 引用块样式
    'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground/30 prose-blockquote:pl-4 prose-blockquote:italic'
  ].join(' '),

  academic: [
    // 学术文档模板：衬线字体、宽行高、正式风格
    'prose prose-neutral dark:prose-invert max-w-none',
    // 字体：衬线体
    'font-serif',
    // 字号与行高：稍大行高，适合长文阅读
    'text-base leading-8',
    // 段落间距：较大
    'prose-p:my-5 prose-p:text-justify',
    // 标题样式：正式、加粗
    'prose-headings:font-bold prose-headings:tracking-normal',
    'prose-h1:text-3xl prose-h1:mt-10 prose-h1:mb-6 prose-h1:text-center',
    'prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:pb-2',
    'prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3',
    'prose-h4:text-lg prose-h4:mt-5 prose-h4:mb-2',
    // 代码块样式
    'prose-pre:bg-muted prose-pre:rounded prose-pre:p-4 prose-pre:border prose-pre:border-border',
    'prose-code:text-sm prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono',
    // 引用块样式：学术引用风格
    'prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:bg-muted/30 prose-blockquote:py-2 prose-blockquote:pr-4'
  ].join(' '),

  clean: [
    // 简洁模板：无衬线、紧凑间距、极简风格
    'prose prose-neutral dark:prose-invert max-w-none',
    // 字体：无衬线
    'font-sans',
    // 字号与行高：紧凑
    'text-sm leading-6',
    // 段落间距：紧凑
    'prose-p:my-2',
    // 标题样式：轻量
    'prose-headings:font-medium prose-headings:tracking-tight',
    'prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-3',
    'prose-h2:text-xl prose-h2:mt-4 prose-h2:mb-2',
    'prose-h3:text-lg prose-h3:mt-3 prose-h3:mb-1.5',
    'prose-h4:text-base prose-h4:mt-2 prose-h4:mb-1',
    // 代码块样式
    'prose-pre:bg-muted/50 prose-pre:rounded-md prose-pre:p-3 prose-pre:text-xs',
    'prose-code:text-xs prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm',
    // 引用块样式：极简
    'prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/20 prose-blockquote:pl-3 prose-blockquote:text-muted-foreground'
  ].join(' '),

  card: [
    // 卡片式模板：内容分块展示，带边框
    'prose prose-neutral dark:prose-invert max-w-none',
    // 字体：无衬线
    'font-sans',
    // 字号与行高
    'text-base leading-7',
    // 段落间距
    'prose-p:my-3',
    // 标题样式：带底部边框分隔
    'prose-headings:font-semibold prose-headings:tracking-tight',
    'prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4 prose-h1:pb-3 prose-h1:border-b-2 prose-h1:border-primary/30',
    'prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border',
    'prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2',
    'prose-h4:text-base prose-h4:mt-4 prose-h4:mb-2 prose-h4:font-semibold',
    // 代码块样式：卡片式
    'prose-pre:bg-muted prose-pre:rounded-xl prose-pre:p-5 prose-pre:border prose-pre:border-border prose-pre:shadow-sm',
    'prose-code:text-sm prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md',
    // 引用块样式：卡片式引用
    'prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-5 prose-blockquote:bg-muted/40 prose-blockquote:py-3 prose-blockquote:pr-5 prose-blockquote:rounded-r-lg prose-blockquote:italic'
  ].join(' ')
}

/**
 * 卡片模板的外层容器样式
 * card 模板将各个 section 以卡片形式展示
 */
const cardWrapperClass =
  '[&>*:not(h1):not(h2)]:border [&>*:not(h1):not(h2)]:border-border [&>*:not(h1):not(h2)]:rounded-lg [&>*:not(h1):not(h2)]:p-4 [&>*:not(h1):not(h2)]:mb-4 [&>*:not(h1):not(h2)]:bg-card'

export function TemplateRenderer({ markdownContent, template }: TemplateRendererProps) {
  const baseClasses = templateStyles[template]
  const wrapperClasses = template === 'card' ? `${baseClasses} ${cardWrapperClass}` : baseClasses

  return (
    <article className={wrapperClasses}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {markdownContent}
      </ReactMarkdown>
    </article>
  )
}
