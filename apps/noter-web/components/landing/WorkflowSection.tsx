'use client'

import { Upload, Code, Bot, MessageCircle } from 'lucide-react'

const steps = [
  {
    icon: <Upload className='size-8 text-[#16A34A]' strokeWidth={2} />,
    number: '1',
    title: 'Upload Documents',
    description: 'Drag in PDFs, notes, and files from anywhere.',
    rotate: '-2deg',
    filled: false
  },
  {
    icon: <Code className='size-8 text-[#16A34A]' strokeWidth={2} />,
    number: '2',
    title: 'Parse into Markdown',
    description: 'Noter converts every file into clean, readable Markdown.',
    rotate: '1deg',
    filled: false
  },
  {
    icon: <Bot className='size-8 text-[#16A34A]' strokeWidth={2} />,
    number: '3',
    title: 'Generate AI Insights',
    description: 'Summaries, mind maps, and answers appear automatically.',
    rotate: '-1.5deg',
    filled: false
  },
  {
    icon: <MessageCircle className='size-8 text-white' strokeWidth={2} />,
    number: '4',
    title: 'Search, Read, and Chat',
    description: 'Explore your knowledge base with powerful AI tools.',
    rotate: '2deg',
    filled: true
  }
]

export function WorkflowSection() {
  return (
    <section
      id='workflow'
      className='relative flex w-full flex-col items-center bg-white px-10 py-25'>
      <div className='flex w-full max-w-[1200px] flex-col items-center gap-15'>
        {/* Header */}
        <div className='flex max-w-[720px] flex-col items-center gap-4'>
          <div className='inline-flex items-center gap-2 rounded-full border border-[#22C55E33] bg-[#22C55E14] px-3.5 py-1.5'>
            <span className='text-center text-xs font-semibold tracking-widest text-[#16A34A] uppercase'>
              Workflow
            </span>
          </div>
          <h2 className='m-0 text-center text-[44px] leading-[115%] font-extrabold tracking-tight text-[#1A1A1A]'>
            From upload to insight in four simple steps
          </h2>
        </div>

        {/* Steps */}
        <div className='relative flex w-full max-w-[1200px] items-start justify-between gap-4 py-5'>
          {steps.map((step) => (
            <div
              key={step.number}
              className='relative flex shrink grow basis-0 origin-center flex-col items-center gap-5'
              style={{ rotate: step.rotate }}>
              <div
                className={`relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#22C55E] ${
                  step.filled ? '' : 'bg-white'
                }`}
                style={
                  step.filled
                    ? { background: 'linear-gradient(135deg, #4ADE80 0%, #16A34A 100%)' }
                    : undefined
                }>
                {step.icon}
                <div
                  className={`absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full ${
                    step.filled ? 'border-2 border-[#16A34A] bg-white' : 'bg-[#22C55E]'
                  }`}>
                  <span
                    className={`text-xs font-bold ${step.filled ? 'text-[#16A34A]' : 'text-white'}`}>
                    {step.number}
                  </span>
                </div>
              </div>
              <div className='flex max-w-[220px] flex-col gap-2'>
                <h3 className='m-0 text-center text-lg font-bold tracking-tight text-[#1A1A1A]'>
                  {step.title}
                </h3>
                <p className='m-0 text-center text-[14px] leading-[160%] text-[#6B7280]'>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
