'use client'

import React from 'react'
import type { TemplateConfig } from '@/types/template'

export const cardTemplate: TemplateConfig = {
  name: 'card',
  label: '卡片',
  description: '分块卡片，层次分明',
  wrapperClassName: 'p-4 md:p-8 space-y-6',
  components: {
    h1: ({ children, id }) => (
      <h1
        id={id}
        className='mb-6 flex items-center gap-3 border-b-2 border-blue-500/30 pb-4 text-2xl font-bold text-gray-900'>
        <span className='h-8 w-1.5 rounded-full bg-gradient-to-b from-blue-500 to-purple-500' />
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <div className='mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm'>
        <h2 id={id} className='mb-4 flex items-center gap-2 text-xl font-semibold text-gray-800'>
          <span className='rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700'>
            §
          </span>
          {children}
        </h2>
      </div>
    ),
    h3: ({ children, id }) => (
      <h3
        id={id}
        className='mt-5 mb-2 border-l-3 border-blue-300 pl-3 text-lg font-semibold text-gray-700'>
        {children}
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className='mt-4 mb-2 text-base font-medium text-gray-600'>
        {children}
      </h4>
    ),
    p: ({ children }) => <p className='my-3 text-base leading-[1.75] text-gray-700'>{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        className='text-blue-600 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-800 hover:decoration-blue-600'
        target='_blank'
        rel='noopener noreferrer'>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <div className='relative my-4 rounded-xl border border-amber-200 bg-amber-50 p-5'>
        <span className='absolute top-3 left-4 font-serif text-3xl leading-none text-amber-300'>
          &ldquo;
        </span>
        <div className='pl-6 text-gray-700 italic'>{children}</div>
      </div>
    ),
    pre: ({ children }) => (
      <div className='my-4 overflow-hidden rounded-xl bg-gray-900 shadow-md'>
        <div className='flex items-center gap-1.5 border-b border-gray-700 bg-gray-800 px-4 py-2'>
          <span className='h-3 w-3 rounded-full bg-red-400' />
          <span className='h-3 w-3 rounded-full bg-yellow-400' />
          <span className='h-3 w-3 rounded-full bg-green-400' />
          <span className='ml-3 text-xs text-gray-400'>Code</span>
        </div>
        <pre className='overflow-x-auto p-5 text-sm leading-relaxed text-gray-100'>{children}</pre>
      </div>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code
            className='rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-sm text-blue-700'
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
    ul: ({ children }) => <ul className='my-3 list-none space-y-2 pl-5'>{children}</ul>,
    ol: ({ children }) => (
      <ol className='my-3 list-decimal space-y-2 pl-5 marker:font-semibold marker:text-blue-500'>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="relative pl-5 text-gray-700 before:absolute before:top-[9px] before:left-0 before:h-1.5 before:w-1.5 before:rounded-full before:bg-blue-400 before:content-['']">
        {children}
      </li>
    ),
    img: ({ src, alt }) => (
      <span className='my-5 block overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'>
        <img src={src} alt={alt || ''} className='w-full object-cover' />
        {alt && (
          <span className='block border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500'>
            {alt}
          </span>
        )}
      </span>
    ),
    table: ({ children }) => (
      <div className='my-4 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm'>
        <table className='w-full border-collapse text-sm'>{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className='border-b border-gray-200 bg-gray-50'>{children}</thead>
    ),
    th: ({ children }) => (
      <th className='px-4 py-3 text-left text-sm font-semibold text-gray-700'>{children}</th>
    ),
    tr: ({ children }) => (
      <tr className='border-b border-gray-100 transition-colors last:border-b-0 even:bg-gray-50/50 hover:bg-blue-50/20'>
        {children}
      </tr>
    ),
    td: ({ children }) => <td className='px-4 py-3 text-gray-700'>{children}</td>,
    hr: () => (
      <div className='my-6 flex items-center justify-center gap-2'>
        <span className='h-2 w-2 rounded-full bg-gray-300' />
        <span className='h-2 w-2 rounded-full bg-gray-300' />
        <span className='h-2 w-2 rounded-full bg-gray-300' />
      </div>
    ),
    strong: ({ children }) => <strong className='font-semibold text-gray-900'>{children}</strong>,
    em: ({ children }) => <em className='text-gray-600 italic'>{children}</em>
  }
}
