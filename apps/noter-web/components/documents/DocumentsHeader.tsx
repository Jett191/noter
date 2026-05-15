'use client'

import Image from 'next/image'
import { Upload } from 'lucide-react'
import { Button } from '@noter/ui/components/button'
import { SearchBar } from './SearchBar'
import { UserAvatarDropdown } from './UserAvatarDropdown'

interface DocumentsHeaderProps {
  onUpload: () => void
}

/**
 * 文档列表页顶部导航栏：胶囊样式，与文档详情页 `DocumentDetailHeader` 保持一致。
 * 内部承载搜索、上传、用户头像。
 */
export function DocumentsHeader({ onUpload }: DocumentsHeaderProps) {
  return (
    <header className='bg-background sticky top-0 z-30 -mx-6 mb-6 border-b border-gray-200 px-6'>
      <div className='flex h-16 w-full items-center gap-4'>
        {/* 左：Logo + 品牌 */}
        <div className='flex shrink-0 items-center gap-2'>
          <Image src='/logo.svg' alt='Noter' width={24} height={24} className='h-6 w-6' priority />
          <span className='text-foreground text-base font-semibold tracking-tight'>noter</span>
        </div>

        {/* 占位：把搜索推到右侧 */}
        <div className='flex-1' />

        {/* 右：搜索 / 上传 / 头像 */}
        <div className='flex shrink-0 items-center gap-3'>
          <div className='w-72'>
            <SearchBar />
          </div>
          <Button onClick={onUpload} size='sm'>
            <Upload data-icon='inline-start' />
            上传文档
          </Button>
          <UserAvatarDropdown />
        </div>
      </div>
    </header>
  )
}
