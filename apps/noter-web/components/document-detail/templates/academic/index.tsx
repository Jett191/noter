'use client'

import type { TemplateConfig } from '@/types/template'

export const academicTemplate: TemplateConfig = {
  name: 'academic',
  label: '学术',
  description: '衬线字体，论文风格',
  wrapperClassName: 'p-8 md:p-14 max-w-[800px] mx-auto',
  components: {
    h1: ({ children, id }) => (
      <h1
        id={id}
        className='mt-12 mb-8 text-center font-serif text-3xl font-bold tracking-wide text-gray-900'>
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2
        id={id}
        className='mt-10 mb-4 border-b-2 border-gray-300 pb-2 font-serif text-2xl font-bold tracking-normal text-gray-800'>
        {children}
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className='mt-8 mb-3 font-serif text-xl text-gray-700 italic'>
        {children}
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className='mt-6 mb-2 font-serif text-lg font-semibold text-gray-700'>
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className='my-4 text-justify indent-[2em] font-serif text-base leading-[2.0] text-gray-800'>
        {children}
      </p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className='font-serif text-blue-800 underline decoration-dotted underline-offset-2 hover:text-blue-900 hover:decoration-solid'
        target='_blank'
        rel='noopener noreferrer'>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="relative mx-8 my-6 py-3 pl-6 font-serif text-sm text-gray-600 italic before:absolute before:top-0 before:left-0 before:font-serif before:text-4xl before:text-gray-300 before:content-['\u201C'] after:font-serif after:text-4xl after:text-gray-300 after:content-['\u201D']">
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre className='my-6 overflow-x-auto rounded border border-gray-200 bg-gray-50 p-4 font-mono text-sm leading-relaxed'>
        {children}
      </pre>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className
      if (isInline) {
        return (
          <code
            className='rounded border border-gray-200 bg-gray-100 px-1 py-0.5 font-mono text-sm text-gray-800'
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
    ul: ({ children }) => (
      <ul className='my-4 list-disc space-y-1.5 pl-8 font-serif marker:text-gray-400'>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className='my-4 list-decimal space-y-1.5 pl-8 font-serif marker:text-gray-600'>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className='pl-1 font-serif leading-[1.8] text-gray-800'>{children}</li>
    ),
    img: ({ src, alt }) => (
      <span className='my-8 block text-center'>
        <img
          src={src}
          alt={alt || ''}
          className='mx-auto max-w-full rounded border border-gray-200'
        />
        {alt && (
          <span className='mt-3 block font-serif text-sm text-gray-500 italic'>图：{alt}</span>
        )}
      </span>
    ),
    table: ({ children }) => (
      <div className='my-8 overflow-x-auto'>
        <table className='w-full border-collapse font-serif text-sm'>{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className='border-t-2 border-b border-gray-900'>{children}</thead>
    ),
    tbody: ({ children }) => <tbody className='border-b-2 border-gray-900'>{children}</tbody>,
    th: ({ children }) => (
      <th className='px-4 py-2 text-left font-serif font-bold text-gray-900'>{children}</th>
    ),
    tr: ({ children }) => <tr className='border-b border-gray-200'>{children}</tr>,
    td: ({ children }) => <td className='px-4 py-2 font-serif text-gray-700'>{children}</td>,
    hr: () => <hr className='mx-16 my-10 h-px border-none bg-gray-300' />,
    strong: ({ children }) => (
      <strong className='font-serif font-bold text-gray-900'>{children}</strong>
    ),
    em: ({ children }) => <em className='font-serif text-gray-700 italic'>{children}</em>
  }
}
