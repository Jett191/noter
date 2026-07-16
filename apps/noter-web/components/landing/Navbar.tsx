'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'

export function Navbar() {
  return (
    <nav className='sticky top-0 z-50 flex w-full justify-center px-10 py-4'>
      <div className='flex w-full max-w-[1200px] items-center justify-between rounded-full border border-[#E2E8E099] bg-white/72 px-8 py-3.5 shadow-[0px_2px_24px_#0000000A] backdrop-blur-md'>
        {/* Logo */}
        <div className='flex items-center gap-2'>
          <div
            className='flex size-8 shrink-0 items-center justify-center rounded-lg'
            style={{
              background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)'
            }}>
            <BookOpen className='size-[18px] text-white' strokeWidth={2.5} />
          </div>
          <span className='font-[family-name:var(--font-sans)] text-xl font-extrabold tracking-tight text-[#1A1A1A]'>
            Noter
          </span>
        </div>

        {/* Nav Links */}
        <div className='flex items-center gap-9'>
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
            href='#ai-tools'
            className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
            AI Tools
          </a>
          <a
            href='#preview'
            className='text-sm font-medium text-[#6B7280] transition-colors hover:text-[#1A1A1A]'>
            Preview
          </a>
        </div>

        {/* Auth Buttons */}
        <div className='flex items-center gap-3'>
          <Link href='/signin' className='rounded-full px-5 py-2.5'>
            <span className='text-sm font-semibold text-[#1A1A1A]'>Sign In</span>
          </Link>
          <Link
            href='/signup'
            className='rounded-full border-2 border-[#1A1A1A] px-5.5 py-2 shadow-[3px_3px_0px_#1A1A1A] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0px_#1A1A1A]'
            style={{
              background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)'
            }}>
            <span className='text-sm font-semibold text-white'>Get Started</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
