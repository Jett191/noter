'use client'

export function ProblemSection() {
  return (
    <section className='relative flex w-full flex-col items-center bg-white px-10 pt-25 pb-15'>
      <div className='flex w-full max-w-[1200px] flex-col items-center gap-15'>
        {/* Header */}
        <div className='flex max-w-[720px] flex-col items-center gap-4'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#E2E8E0] bg-[#F7F9F7] px-3.5 py-1.5'>
            <span className='text-center text-xs font-semibold tracking-widest text-[#6B7280] uppercase'>
              The Problem
            </span>
          </div>
          <h2 className='m-0 text-center text-[44px] leading-[115%] font-extrabold tracking-tight text-[#1A1A1A]'>
            Documents pile up. Useful knowledge gets buried.
          </h2>
        </div>

        {/* Cards */}
        <div className='mt-5 flex w-full max-w-[1200px] gap-6'>
          {/* Card 1 - Scattered Files */}
          <div className='flex shrink grow basis-0 origin-center -rotate-[1.5deg] flex-col gap-5 overflow-hidden rounded-3xl border-2 border-[#1A1A1A] bg-white px-8 py-9 shadow-[6px_6px_0px_#22C55E]'>
            <div
              className='flex size-20 shrink-0 items-center justify-center rounded-[20px]'
              style={{
                background:
                  'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)'
              }}>
              <svg width='40' height='40' viewBox='0 0 48 48' fill='none'>
                <rect
                  x='8'
                  y='12'
                  width='20'
                  height='26'
                  rx='3'
                  fill='#FFFFFF'
                  stroke='#22C55E'
                  strokeWidth='2'
                  transform='rotate(-8 18 25)'
                />
                <rect
                  x='14'
                  y='10'
                  width='20'
                  height='26'
                  rx='3'
                  fill='#FFFFFF'
                  stroke='#22C55E'
                  strokeWidth='2'
                  transform='rotate(6 24 23)'
                />
                <rect
                  x='20'
                  y='14'
                  width='20'
                  height='26'
                  rx='3'
                  fill='#FFFFFF'
                  stroke='#22C55E'
                  strokeWidth='2'
                />
                <line
                  x1='24'
                  y1='22'
                  x2='36'
                  y2='22'
                  stroke='#22C55E'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <line
                  x1='24'
                  y1='28'
                  x2='32'
                  y2='28'
                  stroke='#22C55E'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
              </svg>
            </div>
            <div className='flex flex-col gap-2.5'>
              <h3 className='m-0 text-[22px] leading-[130%] font-bold tracking-tight text-[#1A1A1A]'>
                Scattered Files
              </h3>
              <p className='m-0 text-[15px] leading-[160%] text-[#6B7280]'>
                Your notes, reports, PDFs, and references are stored everywhere.
              </p>
            </div>
          </div>

          {/* Card 2 - Hard to Search */}
          <div className='mt-5 flex shrink grow basis-0 origin-center rotate-[0.5deg] flex-col gap-5 overflow-hidden rounded-3xl border-2 border-[#1A1A1A] bg-white px-8 py-9 shadow-[6px_6px_0px_#3B82F6]'>
            <div
              className='flex size-20 shrink-0 items-center justify-center rounded-[20px]'
              style={{
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 100%)'
              }}>
              <svg width='40' height='40' viewBox='0 0 48 48' fill='none'>
                <circle cx='20' cy='20' r='12' fill='#FFFFFF' stroke='#3B82F6' strokeWidth='2.5' />
                <line
                  x1='30'
                  y1='30'
                  x2='40'
                  y2='40'
                  stroke='#3B82F6'
                  strokeWidth='3'
                  strokeLinecap='round'
                />
                <circle cx='16' cy='16' r='2' fill='#3B82F6' opacity='0.4' />
                <path
                  d='M24 20 L22 18 M24 20 L22 22 M24 20 L26 18 M24 20 L26 22'
                  stroke='#3B82F6'
                  strokeWidth='1.2'
                  strokeLinecap='round'
                  opacity='0.5'
                />
              </svg>
            </div>
            <div className='flex flex-col gap-2.5'>
              <h3 className='m-0 text-[22px] leading-[130%] font-bold tracking-tight text-[#1A1A1A]'>
                Hard to Search
              </h3>
              <p className='m-0 text-[15px] leading-[160%] text-[#6B7280]'>
                You remember the idea, but not the exact keyword.
              </p>
            </div>
          </div>

          {/* Card 3 - Slow Reading */}
          <div className='flex shrink grow basis-0 origin-center -rotate-[0.8deg] flex-col gap-5 overflow-hidden rounded-3xl border-2 border-[#1A1A1A] bg-white px-8 py-9 shadow-[6px_6px_0px_#A855F7]'>
            <div
              className='flex size-20 shrink-0 items-center justify-center rounded-[20px]'
              style={{
                background:
                  'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(168,85,247,0.02) 100%)'
              }}>
              <svg width='40' height='40' viewBox='0 0 48 48' fill='none'>
                <rect
                  x='10'
                  y='8'
                  width='24'
                  height='32'
                  rx='3'
                  fill='#FFFFFF'
                  stroke='#A855F7'
                  strokeWidth='2'
                />
                <line
                  x1='14'
                  y1='16'
                  x2='30'
                  y2='16'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <line
                  x1='14'
                  y1='20'
                  x2='30'
                  y2='20'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <line
                  x1='14'
                  y1='24'
                  x2='26'
                  y2='24'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <line
                  x1='14'
                  y1='28'
                  x2='30'
                  y2='28'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <line
                  x1='14'
                  y1='32'
                  x2='24'
                  y2='32'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                />
                <circle cx='36' cy='10' r='6' fill='#FFFFFF' stroke='#A855F7' strokeWidth='2' />
                <path
                  d='M34 10 L36 12 L38 8'
                  stroke='#A855F7'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  fill='none'
                />
              </svg>
            </div>
            <div className='flex flex-col gap-2.5'>
              <h3 className='m-0 text-[22px] leading-[130%] font-bold tracking-tight text-[#1A1A1A]'>
                Slow Reading
              </h3>
              <p className='m-0 text-[15px] leading-[160%] text-[#6B7280]'>
                Long documents make it difficult to find the real points quickly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
