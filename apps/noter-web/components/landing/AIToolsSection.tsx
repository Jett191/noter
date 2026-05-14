'use client'

import { MessageSquare, List } from 'lucide-react'

export function AIToolsSection() {
  return (
    <section
      id='ai-tools'
      className='relative flex w-full flex-col items-center bg-white px-10 py-25'>
      <div className='flex w-full max-w-[1200px] flex-col items-center gap-15'>
        {/* Header */}
        <div className='flex max-w-[720px] flex-col items-center gap-4'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#22C55E33] bg-[#22C55E14] px-3.5 py-1.5'>
            <span className='text-center text-xs font-semibold tracking-widest text-[#16A34A] uppercase'>
              AI Tools
            </span>
          </div>
          <h2 className='m-0 text-center text-[44px] leading-[115%] font-extrabold tracking-tight text-[#1A1A1A]'>
            AI tools that make documents easier to reuse
          </h2>
        </div>

        {/* Cards */}
        <div className='flex w-full max-w-[1200px] gap-6'>
          {/* Ask Card */}
          <div className='relative flex shrink grow basis-0 origin-center -rotate-[0.8deg] flex-col gap-6 overflow-hidden rounded-3xl border-[1.5px] border-[#1A1A1A] bg-white p-9 shadow-[6px_6px_0px_#22C55E]'>
            <div className='flex items-center gap-3'>
              <div
                className='flex size-11 shrink-0 items-center justify-center rounded-xl shadow-[0px_4px_12px_#22C55E40]'
                style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                <MessageSquare className='size-[22px] text-white' strokeWidth={2} />
              </div>
              <h3 className='m-0 text-2xl font-extrabold tracking-tight text-[#1A1A1A]'>Ask</h3>
            </div>
            <p className='m-0 text-[15px] leading-[165%] text-[#6B7280]'>
              Chat with a document and get answers grounded in its content.
            </p>
            <div className='mt-1 flex flex-col gap-2'>
              <div className='max-w-[80%] self-end rounded-tl-[10px] rounded-tr-[10px] rounded-br-sm rounded-bl-[10px] bg-[#22C55E0F] px-3 py-2'>
                <span className='text-xs text-[#1A1A1A]'>What are the key takeaways?</span>
              </div>
              <div className='max-w-[90%] rounded-tl-[10px] rounded-tr-[10px] rounded-br-[10px] rounded-bl-sm bg-[#F7F9F7] px-3 py-2'>
                <span className='text-[12px] leading-[150%] text-[#4B5563]'>
                  Three main insights stand out in this document...
                </span>
              </div>
            </div>
            <div
              className='absolute -top-10 -right-10 size-40 rounded-full'
              style={{
                background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)'
              }}
            />
          </div>

          {/* Summarize Card */}
          <div className='relative flex shrink grow basis-0 flex-col gap-6 overflow-hidden rounded-3xl border-[1.5px] border-[#1A1A1A] bg-white p-9 shadow-[6px_6px_0px_#3B82F6]'>
            <div className='flex items-center gap-3'>
              <div
                className='flex size-11 shrink-0 items-center justify-center rounded-xl shadow-[0px_4px_12px_#3B82F640]'
                style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)' }}>
                <List className='size-[22px] text-white' strokeWidth={2} />
              </div>
              <h3 className='m-0 text-2xl font-extrabold tracking-tight text-[#1A1A1A]'>
                Summarize
              </h3>
            </div>
            <p className='m-0 text-[15px] leading-[165%] text-[#6B7280]'>
              Turn long files into concise, structured summaries.
            </p>
            <div className='mt-1 flex flex-col gap-2 rounded-xl bg-[#F7F9F7] p-3.5'>
              <div className='flex items-center gap-1.5'>
                <div className='size-1 shrink-0 rounded-full bg-[#3B82F6]' />
                <div className='h-1.5 grow rounded-sm bg-[#E2E8E0]' />
              </div>
              <div className='flex items-center gap-1.5'>
                <div className='size-1 shrink-0 rounded-full bg-[#3B82F6]' />
                <div className='h-1.5 max-w-[85%] grow rounded-sm bg-[#E2E8E0]' />
              </div>
              <div className='flex items-center gap-1.5'>
                <div className='size-1 shrink-0 rounded-full bg-[#3B82F6]' />
                <div className='h-1.5 max-w-[70%] grow rounded-sm bg-[#E2E8E0]' />
              </div>
            </div>
            <div
              className='absolute -top-10 -right-10 size-40 rounded-full'
              style={{
                background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)'
              }}
            />
          </div>

          {/* Visualize Card */}
          <div className='relative flex shrink grow basis-0 origin-center rotate-[0.8deg] flex-col gap-6 overflow-hidden rounded-3xl border-[1.5px] border-[#1A1A1A] bg-white p-9 shadow-[6px_6px_0px_#A855F7]'>
            <div className='flex items-center gap-3'>
              <div
                className='flex size-11 shrink-0 items-center justify-center rounded-xl shadow-[0px_4px_12px_#A855F740]'
                style={{ background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)' }}>
                <svg
                  width='22'
                  height='22'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='#FFFFFF'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'>
                  <circle cx='12' cy='12' r='3' />
                  <circle cx='19' cy='5' r='2' />
                  <circle cx='5' cy='5' r='2' />
                  <circle cx='19' cy='19' r='2' />
                  <circle cx='5' cy='19' r='2' />
                  <line x1='14.5' y1='10.5' x2='17.5' y2='6.5' />
                  <line x1='9.5' y1='10.5' x2='6.5' y2='6.5' />
                  <line x1='14.5' y1='13.5' x2='17.5' y2='17.5' />
                  <line x1='9.5' y1='13.5' x2='6.5' y2='17.5' />
                </svg>
              </div>
              <h3 className='m-0 text-2xl font-extrabold tracking-tight text-[#1A1A1A]'>
                Visualize
              </h3>
            </div>
            <p className='m-0 text-[15px] leading-[165%] text-[#6B7280]'>
              Generate mind maps to understand relationships and hierarchy.
            </p>
            <div className='mt-1 flex min-h-[90px] items-center justify-center rounded-xl bg-[#F7F9F7] p-3.5'>
              <svg width='100%' height='80' viewBox='0 0 240 80' fill='none'>
                <line
                  x1='120'
                  y1='40'
                  x2='40'
                  y2='20'
                  stroke='#A855F7'
                  strokeWidth='1.2'
                  opacity='0.5'
                />
                <line
                  x1='120'
                  y1='40'
                  x2='40'
                  y2='60'
                  stroke='#A855F7'
                  strokeWidth='1.2'
                  opacity='0.5'
                />
                <line
                  x1='120'
                  y1='40'
                  x2='200'
                  y2='20'
                  stroke='#A855F7'
                  strokeWidth='1.2'
                  opacity='0.5'
                />
                <line
                  x1='120'
                  y1='40'
                  x2='200'
                  y2='60'
                  stroke='#A855F7'
                  strokeWidth='1.2'
                  opacity='0.5'
                />
                <circle cx='120' cy='40' r='14' fill='#A855F7' />
                <circle cx='40' cy='20' r='8' fill='#FFFFFF' stroke='#A855F7' strokeWidth='1.5' />
                <circle cx='40' cy='60' r='8' fill='#FFFFFF' stroke='#A855F7' strokeWidth='1.5' />
                <circle cx='200' cy='20' r='8' fill='#FFFFFF' stroke='#A855F7' strokeWidth='1.5' />
                <circle cx='200' cy='60' r='8' fill='#FFFFFF' stroke='#A855F7' strokeWidth='1.5' />
              </svg>
            </div>
            <div
              className='absolute -top-10 -right-10 size-40 rounded-full'
              style={{
                background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)'
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
