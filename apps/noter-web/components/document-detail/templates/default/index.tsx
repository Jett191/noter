'use client'

import type { TemplateConfig } from '@/types/template'

export const defaultTemplate: TemplateConfig = {
  name: 'default',
  label: '默认',
  description: '现代简约风，柔和配色，适合日常阅读',
  wrapperClassName: 'p-8 md:p-12',
  components: {
    h1: ({ children }) => (
      <h1 className='relative mt-8 mb-4 pb-2 text-3xl font-bold tracking-tight text-gray-900'>
        <span className='relative z-10'>{children}</span>
        <span className='absolute bottom-0 left-0 h-1 w-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500' />
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className='mt-8 mb-3 border-l-4 border-blue-500 pl-4 text-2xl font-semibold text-gray-800'>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className='mt-6 mb-2 text-xl font-semibold text-gray-700'>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className='mt-4 mb-2 text-lg font-medium text-gray-700'>{children}</h4>
    ),
    p: ({ children }) => <p className='my-4 text-base leading-[1.8] text-gray-700'>{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        className='relative text-blue-600 after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-0 after:bg-blue-600 after:transition-all after:duration-300 hover:text-blue-800 hover:after:w-full'
        target='_blank'
        rel='noopener noreferrer'>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className='border-gradient my-6 rounded-r-lg border-l-4 border-blue-400 bg-gradient-to-r from-blue-50 to-transparent py-3 pr-4 pl-5 text-gray-600 italic'>
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre className='my-6 overflow-x-auto rounded-xl border-l-4 border-blue-500 bg-gray-900 p-5 text-sm leading-relaxed text-gray-100 shadow-md'>
        {children}
      </pre>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code
            className='rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-pink-600'
            {...props}>
            {children}
          </code>
        )
      }
      return (
        <code className={`${className} font-mono text-sm`} {...props}>
          {children}
        </code>
      )
    },
    ul: ({ children }) => <ul className='my-4 list-none space-y-2 pl-6'>{children}</ul>,
    ol: ({ children }) => (
      <ol className='my-4 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-blue-500'>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="relative pl-5 text-gray-700 before:absolute before:top-[10px] before:left-0 before:h-2 before:w-2 before:rounded-full before:bg-blue-400 before:content-['']">
        {children}
      </li>
    ),
    img: ({ src, alt }) => (
      <span className='my-6 block'>
        <img
          src={src}
          alt={alt || ''}
          className='max-w-full transform rounded-lg shadow-md transition-shadow transition-transform duration-300 hover:scale-[1.02] hover:shadow-xl'
        />
        {alt && <span className='mt-2 block text-center text-sm text-gray-500'>{alt}</span>}
      </span>
    ),
    table: ({ children }) => (
      <div className='my-6 overflow-x-auto rounded-lg border border-gray-200 shadow-sm'>
        <table className='w-full border-collapse text-sm'>{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className='bg-gray-800 text-white'>{children}</thead>,
    th: ({ children }) => <th className='px-4 py-3 text-left text-sm font-semibold'>{children}</th>,
    tr: ({ children }) => (
      <tr className='border-b border-gray-100 transition-colors even:bg-gray-50 hover:bg-blue-50/30'>
        {children}
      </tr>
    ),
    td: ({ children }) => <td className='px-4 py-3 text-gray-700'>{children}</td>,
    hr: () => (
      <hr className='my-8 h-px border-none bg-gradient-to-r from-transparent via-gray-300 to-transparent' />
    ),
    strong: ({ children }) => <strong className='font-semibold text-gray-900'>{children}</strong>,
    em: ({ children }) => <em className='text-gray-600 italic'>{children}</em>
  }
}
