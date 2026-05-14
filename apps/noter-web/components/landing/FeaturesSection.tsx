'use client'

import { BookOpen, Tag, Search, MessageSquare, FileText, GitBranch } from 'lucide-react'

const topFeatures = [
  {
    icon: <BookOpen className='size-[26px] text-[#16A34A]' strokeWidth={2} />,
    title: 'Unified Document Library',
    description: 'Upload, browse, and manage all your documents in one place.'
  },
  {
    icon: <Tag className='size-[26px] text-[#16A34A]' strokeWidth={2} />,
    title: 'Smart Tags',
    description: 'Organize documents with flexible tags and quick filters.'
  },
  {
    icon: <Search className='size-[26px] text-[#16A34A]' strokeWidth={2} />,
    title: 'Hybrid Search',
    description: 'Find content with both exact keywords and semantic meaning.'
  }
]

const bottomFeatures = [
  {
    icon: <MessageSquare className='size-[26px] text-white' strokeWidth={2} />,
    title: 'AI Document Chat',
    description: 'Ask questions about the current document and get contextual answers.',
    highlighted: true
  },
  {
    icon: <FileText className='size-[26px] text-white' strokeWidth={2} />,
    title: 'AI Summary Cards',
    description: 'Extract key points, conclusions, and action items automatically.',
    highlighted: true
  },
  {
    icon: <GitBranch className='size-[26px] text-white' strokeWidth={2} />,
    title: 'AI Mind Maps',
    description: 'Turn complex documents into clear visual structures.',
    highlighted: true
  }
]

export function FeaturesSection() {
  return (
    <section id='features' className='relative flex w-full flex-col items-center px-10 py-25'>
      <div className='flex w-full max-w-[1200px] flex-col items-center gap-15'>
        {/* Header */}
        <div className='flex max-w-[720px] flex-col items-center gap-4'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#22C55E33] bg-[#22C55E14] px-3.5 py-1.5'>
            <span className='text-center text-xs font-semibold tracking-widest text-[#16A34A] uppercase'>
              Features
            </span>
          </div>
          <h2 className='m-0 text-center text-[44px] leading-[115%] font-extrabold tracking-tight text-[#1A1A1A]'>
            Everything you need to manage and understand documents
          </h2>
        </div>

        {/* Feature Cards */}
        <div className='flex w-full max-w-[1200px] flex-col gap-6'>
          {/* Top Row */}
          <div className='flex w-full gap-6'>
            {topFeatures.map((feature) => (
              <div
                key={feature.title}
                className='flex shrink grow basis-0 flex-col gap-5 rounded-[20px] border-[1.5px] border-[#E2E8E0] bg-white p-8 shadow-[0px_1px_3px_#0000000A]'>
                <div className='flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-[#22C55E1A]'>
                  {feature.icon}
                </div>
                <div className='flex flex-col gap-2'>
                  <h3 className='m-0 text-[20px] leading-[130%] font-bold tracking-tight text-[#1A1A1A]'>
                    {feature.title}
                  </h3>
                  <p className='m-0 text-[15px] leading-[160%] text-[#6B7280]'>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Row - AI Features */}
          <div className='flex w-full gap-6'>
            {bottomFeatures.map((feature) => (
              <div
                key={feature.title}
                className='flex shrink grow basis-0 flex-col gap-5 rounded-[20px] border-[1.5px] border-[#22C55E26] p-8'
                style={{
                  background:
                    'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 100%)'
                }}>
                <div
                  className='flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] shadow-[0px_4px_12px_#22C55E40]'
                  style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                  {feature.icon}
                </div>
                <div className='flex flex-col gap-2'>
                  <h3 className='m-0 text-[20px] leading-[130%] font-bold tracking-tight text-[#1A1A1A]'>
                    {feature.title}
                  </h3>
                  <p className='m-0 text-[15px] leading-[160%] text-[#6B7280]'>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
