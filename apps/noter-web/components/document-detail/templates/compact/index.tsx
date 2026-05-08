'use client'

import type { TemplateConfig } from '@/types/template'

export const compactTemplate: TemplateConfig = {
  name: 'compact',
  label: '紧凑',
  description: '信息密度高，适合长文档快速浏览',
  wrapperClassName: 'bg-white p-6 md:p-8',
  components: {
    h1: ({ children }) => (
      <h1 className='mt-5 mb-2 border-b border-gray-200 pb-2 text-xl font-bold text-gray-900'>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className='mt-4 mb-1.5 text-base font-bold text-gray-800'>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className='mt-3 mb-1 text-sm font-semibold text-gray-700'>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className='mt-2 mb-1 text-sm font-medium text-gray-600'>{children}</h4>
    ),
    p: ({ children }) => (
      <p className='my-1.5 text-[13px] leading-[1.5] text-gray-700'>{children}</p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className='text-[13px] text-blue-600 hover:underline'
        target='_blank'
        rel='noopener noreferrer'>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className='my-2 border-l-2 border-gray-300 pl-3 text-[13px] text-gray-500'>
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre className='my-2 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-3 text-xs leading-snug'>
        {children}
      </pre>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code
            className='rounded-sm bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800'
            {...props}>
            {children}
          </code>
        )
      }
      return (
        <code className={`${className} font-mono text-xs`} {...props}>
          {children}
        </code>
      )
    },
    ul: ({ children }) => (
      <ul className='my-1.5 list-disc space-y-0.5 pl-4 text-[13px] marker:text-gray-400'>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className='my-1.5 list-decimal space-y-0.5 pl-4 text-[13px] marker:text-gray-500'>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className='pl-0.5 text-[13px] leading-[1.5] text-gray-700'>{children}</li>
    ),
    img: ({ src, alt }) => (
      <span className='my-3 block'>
        <img src={src} alt={alt || ''} className='max-w-full rounded border border-gray-200' />
        {alt && <span className='mt-1 block text-xs text-gray-400'>{alt}</span>}
      </span>
    ),
    table: ({ children }) => (
      <div className='my-3 overflow-x-auto'>
        <table className='w-full border-collapse text-xs'>{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className='border-b border-gray-200 bg-gray-50'>{children}</thead>
    ),
    th: ({ children }) => (
      <th className='px-3 py-1.5 text-left text-xs font-semibold text-gray-700'>{children}</th>
    ),
    tr: ({ children }) => (
      <tr className='border-b border-gray-100 even:bg-gray-50/50'>{children}</tr>
    ),
    td: ({ children }) => <td className='px-3 py-1.5 text-xs text-gray-600'>{children}</td>,
    hr: () => <hr className='my-4 border-gray-200' />,
    strong: ({ children }) => <strong className='font-semibold text-gray-900'>{children}</strong>,
    em: ({ children }) => <em className='text-gray-500 italic'>{children}</em>
  }
}
