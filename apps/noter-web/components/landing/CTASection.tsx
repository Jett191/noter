'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function CTASection() {
  return (
    <section className='flex w-full flex-col items-center bg-white px-10 py-20'>
      <div
        className='relative flex w-full max-w-[1120px] flex-col items-center gap-7 overflow-hidden rounded-[32px] px-15 py-20 shadow-[0px_20px_60px_#22C55E40]'
        style={{ background: 'linear-gradient(135deg, #16A34A 0%, #4ADE80 100%)' }}>
        {/* Decorative Elements */}
        <div
          className='absolute -top-20 -left-20 size-60 rounded-full'
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)'
          }}
        />
        <div
          className='absolute -right-20 -bottom-20 h-[280px] w-[280px] rounded-full'
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)'
          }}
        />
        <svg
          className='absolute top-10 right-20'
          width='24'
          height='24'
          viewBox='0 0 24 24'
          fill='none'>
          <path
            d='M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z'
            fill='#FFFFFF'
            opacity='0.3'
          />
        </svg>
        <svg
          className='absolute bottom-[60px] left-[100px]'
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'>
          <circle cx='12' cy='12' r='6' fill='#FFFFFF' opacity='0.2' />
        </svg>
        <svg
          className='absolute top-5 right-[60px]'
          width='50'
          height='50'
          viewBox='0 0 50 50'
          fill='none'>
          <path
            d='M25 5 L29 18 L42 20 L29 22 L25 35 L21 22 L8 20 L21 18 Z'
            fill='#FFFFFF'
            opacity='0.9'
          />
        </svg>

        {/* Badge */}
        <div className='relative inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-3.5 py-1.5 backdrop-blur-sm'>
          <div className='size-2 shrink-0 rounded-full bg-white' />
          <span className='text-center text-xs font-semibold tracking-widest text-white uppercase'>
            Ready to Start
          </span>
        </div>

        {/* Heading */}
        <h2 className='relative m-0 max-w-[800px] text-center text-[52px] leading-[110%] font-extrabold tracking-tight text-white'>
          Start building your personal document knowledge base
        </h2>

        {/* Description */}
        <p className='relative m-0 max-w-[640px] text-center text-lg leading-[160%] text-white/90'>
          Upload your first document and let Noter help you search, read, summarize, and understand
          it.
        </p>

        {/* CTA Button */}
        <Link
          href='/signup'
          className='relative mt-3 flex items-center gap-2.5 rounded-[14px] border-[3px] border-[#1A1A1A] bg-white px-9.5 py-3.5 shadow-[5px_5px_0px_#1A1A1A] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0px_#1A1A1A]'>
          <span className='text-center text-base font-bold text-[#16A34A]'>Enter Noter</span>
          <ArrowRight className='size-[18px] text-[#16A34A]' strokeWidth={2.5} />
        </Link>
      </div>
    </section>
  )
}
