'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'

export function Footer() {
  return (
    <footer className='flex w-full flex-col items-center border-t border-[#E2E8E0] bg-white px-10 pt-15 pb-10'>
      <div className='flex w-full max-w-[1200px] flex-col gap-10'>
        <div className='flex items-start justify-between gap-15'>
          {/* Brand */}
          <div className='flex max-w-[320px] flex-col gap-4'>
            <div className='flex items-center gap-2.5'>
              <div
                className='flex size-9 shrink-0 items-center justify-center rounded-[10px]'
                style={{ background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }}>
                <BookOpen className='size-5 text-white' strokeWidth={2.5} />
              </div>
              <span className='text-[22px] font-extrabold tracking-tight text-[#1A1A1A]'>
                Noter
              </span>
            </div>
            <p className='m-0 text-[14px] leading-[160%] text-[#6B7280]'>
              AI-powered document knowledge management.
            </p>
          </div>

          {/* Links */}
          <div className='flex gap-20'>
            <div className='flex flex-col gap-3.5'>
              <span className='text-[13px] font-bold tracking-widest text-[#1A1A1A] uppercase'>
                Product
              </span>
              <a
                href='#features'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                Features
              </a>
              <a
                href='#workflow'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                Workflow
              </a>
              <a
                href='#preview'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                Preview
              </a>
              <a
                href='#ai-tools'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                AI Tools
              </a>
            </div>
            <div className='flex flex-col gap-3.5'>
              <span className='text-[13px] font-bold tracking-widest text-[#1A1A1A] uppercase'>
                Get Started
              </span>
              <Link
                href='/signin'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                Sign In
              </Link>
              <Link
                href='/signup'
                className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
                Create Account
              </Link>
              <Link
                href='/signup'
                className='text-sm font-medium text-[#16A34A] transition-colors hover:text-[#15803D]'>
                Enter Noter →
              </Link>
            </div>
          </div>
        </div>

        <div className='h-px shrink-0 bg-[#E2E8E0]' />

        <div className='flex items-center justify-between'>
          <span className='text-[13px] text-[#9CA3AF]'>© 2026 Noter. A graduation project.</span>
          <div className='flex items-center gap-2'>
            <div className='size-1.5 shrink-0 rounded-full bg-[#22C55E]' />
            <span className='text-[13px] font-medium text-[#6B7280]'>
              Built with AI, for readers.
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
