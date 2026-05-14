'use client'

import { Search, Home, Star, Clock, FileText, Coffee } from 'lucide-react'

export function PreviewSection() {
  return (
    <section
      id='preview'
      className='relative flex w-full flex-col items-center overflow-hidden px-10 py-25'
      style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFCFA 50%, #FFFFFF 100%)' }}>
      {/* Background Glows */}
      <div
        className='absolute top-[215px] left-[71px] h-[300px] w-[300px] rounded-full'
        style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)' }}
      />
      <div
        className='absolute right-[72px] bottom-[216px] h-[300px] w-[300px] rounded-full'
        style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)' }}
      />

      <div className='relative flex w-full max-w-[1200px] flex-col items-center gap-15'>
        {/* Header */}
        <div className='flex max-w-[720px] flex-col items-center gap-4'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#22C55E33] bg-[#22C55E14] px-3.5 py-1.5'>
            <span className='text-center text-xs font-semibold tracking-widest text-[#16A34A] uppercase'>
              Product Preview
            </span>
          </div>
          <h2 className='m-0 text-center text-[44px] leading-[115%] font-extrabold tracking-tight text-[#1A1A1A]'>
            A clean workspace for every document
          </h2>
          <p className='m-0 max-w-[600px] text-center text-[17px] leading-[160%] text-[#6B7280]'>
            Designed for focus. Every tool you need is one click away, never in the way.
          </p>
        </div>

        {/* App Preview */}
        <div className='w-full max-w-[1120px] overflow-hidden rounded-[20px] border border-[#E2E8E0] bg-white shadow-[0px_20px_60px_#00000014,0px_4px_16px_#0000000A]'>
          {/* Title Bar */}
          <div className='flex items-center gap-2 border-b border-[#E2E8E0] bg-[#F7F9F7] px-5 py-4'>
            <div className='flex gap-1.5'>
              <div className='size-3 shrink-0 rounded-full bg-[#FF6B6B]' />
              <div className='size-3 shrink-0 rounded-full bg-[#FFD93D]' />
              <div className='size-3 shrink-0 rounded-full bg-[#6BCB77]' />
            </div>
            <div className='ml-4 flex h-8 max-w-[420px] grow items-center gap-2 rounded-lg border border-[#E2E8E0] bg-white px-3'>
              <Search className='size-3.5 text-[#9CA3AF]' strokeWidth={2} />
              <span className='grow text-[13px] text-[#9CA3AF]'>
                Search across your knowledge base...
              </span>
              <span className='rounded-sm bg-[#F7F9F7] px-1.5 py-0.5 text-[11px] text-[#9CA3AF]'>
                ⌘K
              </span>
            </div>
            <div className='grow' />
            <div className='flex gap-2'>
              <div className='flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E8E0] bg-white'>
                <Coffee className='size-3.5 text-[#6B7280]' strokeWidth={2} />
              </div>
              <div
                className='flex size-8 shrink-0 items-center justify-center rounded-lg'
                style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                <span className='text-[13px] font-bold text-white'>J</span>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className='flex h-[560px]'>
            {/* Sidebar */}
            <div className='flex w-[220px] shrink-0 flex-col gap-1.5 border-r border-[#E2E8E0] bg-[#FAFCFA] px-4 py-5'>
              <div className='flex items-center gap-2 rounded-lg bg-[#22C55E14] px-2.5 py-2'>
                <Home className='size-4 text-[#16A34A]' strokeWidth={2} />
                <span className='text-[13px] font-semibold text-[#16A34A]'>All Documents</span>
                <span className='ml-auto rounded-sm bg-[#22C55E26] px-1.5 py-0.5 text-[11px] text-[#16A34A]'>
                  128
                </span>
              </div>
              <div className='flex items-center gap-2 px-2.5 py-2'>
                <Star className='size-4 text-[#6B7280]' strokeWidth={2} />
                <span className='text-[13px] font-medium text-[#4B5563]'>Starred</span>
              </div>
              <div className='flex items-center gap-2 px-2.5 py-2'>
                <Clock className='size-4 text-[#6B7280]' strokeWidth={2} />
                <span className='text-[13px] font-medium text-[#4B5563]'>Recent</span>
              </div>
              <div className='my-3 h-px shrink-0 bg-[#E2E8E0]' />
              <div className='mb-1 px-2.5'>
                <span className='text-[11px] font-semibold tracking-widest text-[#9CA3AF] uppercase'>
                  Tags
                </span>
              </div>
              <TagItem color='#22C55E' label='Research' count='42' />
              <TagItem color='#3B82F6' label='Notes' count='36' />
              <TagItem color='#A855F7' label='Reports' count='28' />
              <TagItem color='#F97316' label='Projects' count='22' />
            </div>

            {/* Document Content */}
            <div className='flex grow flex-col gap-4.5 overflow-hidden px-7 py-6'>
              <div className='flex items-center gap-2.5'>
                <div className='inline-flex items-center gap-1.5 rounded-md bg-[#22C55E1A] px-2.5 py-1'>
                  <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E]' />
                  <span className='text-[11px] font-semibold text-[#16A34A]'>Research</span>
                </div>
                <span className='text-xs text-[#9CA3AF]'>Updated 2 hours ago · 12 min read</span>
              </div>
              <h3 className='m-0 text-[26px] leading-[120%] font-extrabold tracking-tight text-[#1A1A1A]'>
                Neural Architecture Search: A Survey
              </h3>
              {/* Content Lines */}
              <div className='flex flex-col gap-2.5 py-1'>
                <div className='h-2 w-full rounded-sm bg-[#E2E8E0]' />
                <div className='h-2 w-[92%] rounded-sm bg-[#E2E8E0]' />
                <div className='h-2 w-[88%] rounded-sm bg-[#E2E8E0]' />
              </div>
              {/* AI Summary */}
              <div
                className='flex flex-col gap-2 rounded-lg border-l-[3px] border-l-[#22C55E] px-4 py-3.5'
                style={{
                  background:
                    'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 100%)'
                }}>
                <div className='flex items-center gap-1.5'>
                  <FileText className='size-3.5 text-[#16A34A]' strokeWidth={2} />
                  <span className='text-xs font-bold tracking-widest text-[#16A34A] uppercase'>
                    AI Summary
                  </span>
                </div>
                <p className='m-0 text-[13px] leading-[160%] text-[#374151]'>
                  The paper introduces a gradient-based method that reduces search time by 40% while
                  maintaining 95% accuracy on benchmark datasets.
                </p>
                <div className='mt-1 flex flex-wrap gap-1.5'>
                  <span className='rounded-md border border-[#22C55E33] bg-white px-2 py-0.5 text-[11px] font-medium text-[#16A34A]'>
                    Gradient-based
                  </span>
                  <span className='rounded-md border border-[#22C55E33] bg-white px-2 py-0.5 text-[11px] font-medium text-[#16A34A]'>
                    40% faster
                  </span>
                  <span className='rounded-md border border-[#22C55E33] bg-white px-2 py-0.5 text-[11px] font-medium text-[#16A34A]'>
                    95% accuracy
                  </span>
                </div>
              </div>
              {/* Mind Map */}
              <div className='flex flex-col gap-2.5 rounded-xl border border-[#E2E8E0] bg-white p-4'>
                <div className='flex items-center gap-1.5'>
                  <svg
                    width='14'
                    height='14'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='#6B7280'
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
                  <span className='text-xs font-bold tracking-widest text-[#4B5563] uppercase'>
                    Mind Map
                  </span>
                </div>
                <div className='flex h-[100px] shrink-0 items-center justify-center'>
                  <svg width='100%' height='100' viewBox='0 0 380 100' fill='none'>
                    <line
                      x1='190'
                      y1='50'
                      x2='60'
                      y2='25'
                      stroke='#22C55E'
                      strokeWidth='1.5'
                      opacity='0.5'
                    />
                    <line
                      x1='190'
                      y1='50'
                      x2='60'
                      y2='75'
                      stroke='#22C55E'
                      strokeWidth='1.5'
                      opacity='0.5'
                    />
                    <line
                      x1='190'
                      y1='50'
                      x2='320'
                      y2='25'
                      stroke='#22C55E'
                      strokeWidth='1.5'
                      opacity='0.5'
                    />
                    <line
                      x1='190'
                      y1='50'
                      x2='320'
                      y2='75'
                      stroke='#22C55E'
                      strokeWidth='1.5'
                      opacity='0.5'
                    />
                    <rect x='155' y='35' width='70' height='30' rx='15' fill='#22C55E' />
                    <text
                      x='190'
                      y='54'
                      fontFamily='system-ui'
                      fontSize='11'
                      fontWeight='600'
                      fill='#FFFFFF'
                      textAnchor='middle'>
                      NAS
                    </text>
                    <rect
                      x='10'
                      y='12'
                      width='90'
                      height='26'
                      rx='13'
                      fill='#FFFFFF'
                      stroke='#3B82F6'
                      strokeWidth='1.5'
                    />
                    <text
                      x='55'
                      y='29'
                      fontFamily='system-ui'
                      fontSize='10'
                      fontWeight='500'
                      fill='#3B82F6'
                      textAnchor='middle'>
                      Search Space
                    </text>
                    <rect
                      x='10'
                      y='62'
                      width='90'
                      height='26'
                      rx='13'
                      fill='#FFFFFF'
                      stroke='#A855F7'
                      strokeWidth='1.5'
                    />
                    <text
                      x='55'
                      y='79'
                      fontFamily='system-ui'
                      fontSize='10'
                      fontWeight='500'
                      fill='#A855F7'
                      textAnchor='middle'>
                      Strategy
                    </text>
                    <rect
                      x='280'
                      y='12'
                      width='90'
                      height='26'
                      rx='13'
                      fill='#FFFFFF'
                      stroke='#F97316'
                      strokeWidth='1.5'
                    />
                    <text
                      x='325'
                      y='29'
                      fontFamily='system-ui'
                      fontSize='10'
                      fontWeight='500'
                      fill='#F97316'
                      textAnchor='middle'>
                      Evaluation
                    </text>
                    <rect
                      x='280'
                      y='62'
                      width='90'
                      height='26'
                      rx='13'
                      fill='#FFFFFF'
                      stroke='#EC4899'
                      strokeWidth='1.5'
                    />
                    <text
                      x='325'
                      y='79'
                      fontFamily='system-ui'
                      fontSize='10'
                      fontWeight='500'
                      fill='#EC4899'
                      textAnchor='middle'>
                      Applications
                    </text>
                  </svg>
                </div>
              </div>
            </div>

            {/* AI Chat Panel */}
            <div className='flex w-[320px] shrink-0 flex-col gap-3 border-l border-[#E2E8E0] bg-[#FAFCFA] px-4.5 py-5'>
              <div className='flex items-center gap-2.5 border-b border-[#E2E8E0] pb-3'>
                <div
                  className='flex size-8 shrink-0 items-center justify-center rounded-[10px]'
                  style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                  <svg
                    width='16'
                    height='16'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='#FFFFFF'
                    strokeWidth='2.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'>
                    <path d='M12 2L2 7l10 5 10-5-10-5z' />
                    <path d='M2 17l10 5 10-5' />
                    <path d='M2 12l10 5 10-5' />
                  </svg>
                </div>
                <div className='flex flex-col gap-0.5'>
                  <span className='text-[13px] font-bold text-[#1A1A1A]'>AI Assistant</span>
                  <div className='flex items-center gap-1'>
                    <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E]' />
                    <span className='text-[11px] font-medium text-[#16A34A]'>Ready</span>
                  </div>
                </div>
              </div>
              <div className='max-w-[85%] self-end rounded-t-xl rounded-br-sm rounded-bl-xl border border-[#22C55E26] bg-[#22C55E0F] px-3 py-2.5'>
                <p className='m-0 text-[12px] leading-[150%] text-[#1A1A1A]'>
                  What&apos;s the main contribution of this paper?
                </p>
              </div>
              <div className='max-w-[90%] rounded-t-xl rounded-br-xl rounded-bl-sm border border-[#E2E8E0] bg-white px-3 py-2.5'>
                <p className='m-0 text-[12px] leading-[155%] text-[#374151]'>
                  The paper proposes DARTS, a differentiable architecture search method that
                  replaces discrete sampling with a continuous relaxation, allowing gradient descent
                  to optimize the architecture directly.
                </p>
              </div>
              <div className='max-w-[90%] rounded-t-xl rounded-br-xl rounded-bl-sm border border-[#E2E8E0] bg-white px-3 py-2.5'>
                <div className='flex gap-1 py-0.5'>
                  <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E] opacity-90' />
                  <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E] opacity-60' />
                  <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E] opacity-30' />
                </div>
              </div>
              <div className='grow' />
              <div className='flex items-center gap-2 rounded-xl border border-[#E2E8E0] bg-white px-3.5 py-2.5'>
                <span className='grow text-xs text-[#9CA3AF]'>Ask anything about this doc...</span>
                <div
                  className='flex size-7 shrink-0 items-center justify-center rounded-lg'
                  style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                  <svg
                    width='12'
                    height='12'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='#FFFFFF'
                    strokeWidth='2.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'>
                    <line x1='22' y1='2' x2='11' y2='13' />
                    <polygon points='22 2 15 22 11 13 2 9 22 2' />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TagItem({ color, label, count }: { color: string; label: string; count: string }) {
  return (
    <div className='flex items-center gap-2 px-2.5 py-1.5'>
      <div className='size-2 shrink-0 rounded-full' style={{ backgroundColor: color }} />
      <span className='text-[13px] text-[#4B5563]'>{label}</span>
      <span className='ml-auto text-[11px] text-[#9CA3AF]'>{count}</span>
    </div>
  )
}
