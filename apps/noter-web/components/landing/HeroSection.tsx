'use client'

import Link from 'next/link'
import { FileText, Search } from 'lucide-react'

export function HeroSection() {
  return (
    <section className='relative mx-auto flex w-full max-w-[1200px] items-center justify-between gap-15 px-10 pt-25 pb-20'>
      {/* Left Content */}
      <div className='relative flex max-w-[560px] shrink grow basis-0 flex-col gap-7'>
        {/* Badge */}
        <div className='inline-flex w-fit items-center gap-2 rounded-full border border-[#22C55E33] bg-[#22C55E14] py-1.5 pr-4 pl-2.5'>
          <div className='size-2 shrink-0 rounded-full bg-[#22C55E]' />
          <span className='text-[13px] font-semibold tracking-wide text-[#16A34A]'>
            AI Document Workspace
          </span>
        </div>

        {/* Heading */}
        <h1 className='m-0 text-[56px] leading-[108%] font-extrabold tracking-tight text-[#1A1A1A]'>
          Turn your documents into a living knowledge base
        </h1>

        {/* Description */}
        <p className='m-0 text-lg leading-[165%] text-[#6B7280]'>
          Noter helps you organize documents, search by meaning, generate summaries and mind maps,
          and chat with your files in one clean workspace.
        </p>

        {/* CTA Buttons */}
        <div className='mt-2 flex items-center gap-4'>
          <Link
            href='/signup'
            className='rounded-xl border-[2.5px] border-[#1A1A1A] px-7.5 py-3 shadow-[4px_4px_0px_#1A1A1A] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#1A1A1A]'
            style={{
              background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)'
            }}>
            <span className='text-base font-semibold text-white'>Get Started</span>
          </Link>
          <a
            href='#features'
            className='rounded-xl border-[2.5px] border-[#1A1A1A] bg-[#F7F9F7] px-7.5 py-3 shadow-[4px_4px_0px_#1A1A1A] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#1A1A1A]'>
            <span className='text-base font-semibold text-[#1A1A1A]'>Explore Features</span>
          </a>
        </div>
      </div>

      {/* Right Illustration */}
      <div className='relative flex h-[560px] min-h-[560px] w-[600px] max-w-[580px] shrink grow basis-0 items-center justify-center'>
        {/* Background Glow */}
        <div
          className='absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full'
          style={{
            background:
              'radial-gradient(circle, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.04) 50%, transparent 70%)'
          }}
        />

        {/* Main App Window */}
        <div className='absolute top-[50px] left-[30px] w-[380px] overflow-hidden rounded-2xl border-2 border-[#1A1A1A] bg-white shadow-[5px_5px_0px_#22C55E,0px_8px_40px_#0000000F]'>
          {/* Window Header */}
          <div className='flex items-center gap-1.5 border-b border-[#F1F5F1] px-4 py-3'>
            <div className='size-2.5 shrink-0 rounded-full bg-[#FF6B6B]' />
            <div className='size-2.5 shrink-0 rounded-full bg-[#FFD93D]' />
            <div className='size-2.5 shrink-0 rounded-full bg-[#6BCB77]' />
            <div className='ml-3 flex h-7 grow items-center rounded-md bg-[#F7F9F7] px-3'>
              <Search className='size-3.5 text-[#6B7280]' strokeWidth={2} />
              <span className='ml-2 text-xs text-[#9CA3AF]'>Search documents...</span>
            </div>
          </div>
          {/* Window Content */}
          <div className='flex h-[280px]'>
            {/* Sidebar */}
            <div className='flex w-[120px] shrink-0 flex-col gap-1.5 border-r border-[#F1F5F1] px-2.5 py-3'>
              <div className='text-[10px] font-semibold tracking-widest text-[#9CA3AF] uppercase'>
                Tags
              </div>
              <div className='flex items-center gap-1 rounded-md bg-[#22C55E14] px-2 py-1'>
                <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E]' />
                <span className='text-[11px] font-medium text-[#16A34A]'>Research</span>
              </div>
              <div className='flex items-center gap-1 rounded-md bg-[#3B82F614] px-2 py-1'>
                <div className='size-1.5 shrink-0 rounded-full bg-[#3B82F6]' />
                <span className='text-[11px] font-medium text-[#3B82F6]'>Notes</span>
              </div>
              <div className='flex items-center gap-1 rounded-md bg-[#A855F714] px-2 py-1'>
                <div className='size-1.5 shrink-0 rounded-full bg-[#A855F7]' />
                <span className='text-[11px] font-medium text-[#A855F7]'>Reports</span>
              </div>
              <div className='flex items-center gap-1 rounded-md bg-[#F9731614] px-2 py-1'>
                <div className='size-1.5 shrink-0 rounded-full bg-[#F97316]' />
                <span className='text-[11px] font-medium text-[#F97316]'>Projects</span>
              </div>
            </div>
            {/* Document List */}
            <div className='flex grow flex-col gap-2 overflow-hidden p-3'>
              <DocumentCard
                icon={<FileText className='size-3.5 text-[#22C55E]' />}
                title='Research Paper Draft'
                time='Updated 2 hours ago'
                active
              />
              <DocumentCard
                icon={<FileText className='size-3.5 text-[#3B82F6]' />}
                title='Meeting Notes'
                time='Updated yesterday'
              />
              <DocumentCard
                icon={<FileText className='size-3.5 text-[#A855F7]' />}
                title='Q3 Report'
                time='Updated 3 days ago'
              />
            </div>
          </div>
        </div>

        {/* AI Chat Bubble */}
        <div className='absolute top-[100px] -right-[50px] flex w-[210px] max-w-[180px] flex-col gap-2'>
          <div className='max-w-[180px] rounded-t-xl rounded-br-xl rounded-bl-sm border border-[#E2E8E0] bg-white px-3.5 py-2.5 shadow-[0px_4px_20px_#0000000F]'>
            <div className='mb-1.5 flex items-center gap-1.5'>
              <div
                className='flex size-5 shrink-0 items-center justify-center rounded-full'
                style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                <svg
                  width='10'
                  height='10'
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
              <span className='text-[11px] font-semibold text-[#16A34A]'>AI Assistant</span>
            </div>
            <p className='m-0 text-[11px] leading-[150%] text-[#4B5563]'>
              This paper proposes a new neural architecture approach...
            </p>
          </div>
          <div className='w-[190px] max-w-[190px] self-end rounded-t-xl rounded-br-sm rounded-bl-xl border border-[#22C55E26] bg-[#22C55E0F] px-3.5 py-2.5'>
            <p className='m-0 text-[11px] leading-[150%] text-[#1A1A1A]'>
              Summarize the key findings
            </p>
          </div>
          <div className='max-w-[180px] rounded-t-xl rounded-br-xl rounded-bl-sm border border-[#E2E8E0] bg-white px-3.5 py-2.5 shadow-[0px_4px_20px_#0000000F]'>
            <p className='m-0 text-[11px] leading-[150%] text-[#4B5563]'>
              Main findings: 15% accuracy improvement.
            </p>
          </div>
        </div>

        {/* Summary Card */}
        <div className='absolute bottom-5 left-[30px] flex items-end gap-3'>
          <div className='w-[170px] shrink-0 rounded-[14px] border border-[#E2E8E0] bg-white px-4 py-3.5 shadow-[0px_6px_24px_#0000000F]'>
            <div className='mb-2 flex items-center gap-1.5'>
              <FileText className='size-3.5 text-[#22C55E]' />
              <span className='text-[11px] font-semibold text-[#1A1A1A]'>AI Summary</span>
            </div>
            <div className='flex flex-col gap-1'>
              <div className='h-1.5 w-full rounded-sm bg-[#E2E8E0]' />
              <div className='h-1.5 w-[85%] rounded-sm bg-[#E2E8E0]' />
              <div className='h-1.5 w-[70%] rounded-sm bg-[#E2E8E0]' />
              <div className='h-1.5 w-[60%] rounded-sm bg-[#22C55E33]' />
            </div>
          </div>

          {/* Mind Map Mini */}
          <div className='flex flex-col items-center gap-2'>
            <div className='flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-[#22C55E] bg-white shadow-[0px_4px_16px_#22C55E26]'>
              <span className='text-[9px] font-semibold text-[#16A34A]'>Core</span>
            </div>
            <div className='flex gap-2.5'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#22C55E4D] bg-[#22C55E14]'>
                <span className='text-[8px] font-medium text-[#16A34A]'>Method</span>
              </div>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#3B82F64D] bg-[#3B82F614]'>
                <span className='text-[8px] font-medium text-[#3B82F6]'>Results</span>
              </div>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#A855F74D] bg-[#A855F714]'>
                <span className='text-[8px] font-medium text-[#A855F7]'>Future</span>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <svg
          className='absolute top-[15px] left-[15px]'
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'>
          <path
            d='M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z'
            fill='#22C55E'
            opacity='0.3'
          />
        </svg>
        <svg
          className='absolute top-[60px] right-[5px]'
          width='12'
          height='12'
          viewBox='0 0 24 24'
          fill='none'>
          <circle cx='12' cy='12' r='4' fill='#22C55E' opacity='0.2' />
        </svg>
        <svg
          className='absolute right-[30px] bottom-[80px]'
          width='20'
          height='20'
          viewBox='0 0 24 24'
          fill='none'>
          <path
            d='M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z'
            fill='#FFD93D'
            opacity='0.4'
          />
        </svg>
      </div>

      {/* Decorative SVGs */}
      <svg
        className='absolute top-[80px] -left-[30px] -rotate-[15deg]'
        width='60'
        height='60'
        viewBox='0 0 60 60'
        fill='none'>
        <path
          d='M30 5 L35 25 L55 30 L35 35 L30 55 L25 35 L5 30 L25 25 Z'
          fill='#FFD93D'
          opacity='0.6'
        />
        <path
          d='M30 10 L33 25 L48 30 L33 35 L30 50 L27 35 L12 30 L27 25 Z'
          fill='#FFF9E6'
          opacity='0.8'
        />
      </svg>
      <svg
        className='absolute top-[200px] -right-[40px] rotate-[25deg]'
        width='50'
        height='50'
        viewBox='0 0 50 50'
        fill='none'>
        <circle cx='25' cy='25' r='20' fill='#A855F7' opacity='0.15' />
        <circle cx='25' cy='25' r='12' fill='#A855F7' opacity='0.25' />
        <circle cx='25' cy='25' r='5' fill='#A855F7' opacity='0.4' />
      </svg>
    </section>
  )
}

function DocumentCard({
  icon,
  title,
  time,
  active
}: {
  icon: React.ReactNode
  title: string
  time: string
  active?: boolean
}) {
  return (
    <div
      className={`rounded-[10px] border border-[#E2E8E0] px-3 py-2.5 ${active ? 'bg-[#F7F9F7]' : 'bg-white'}`}>
      <div className='mb-1 flex items-center gap-1.5'>
        {icon}
        <span className='text-xs font-semibold text-[#1A1A1A]'>{title}</span>
      </div>
      <span className='text-[10px] text-[#9CA3AF]'>{time}</span>
    </div>
  )
}
