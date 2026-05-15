'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@noter/ui/components/card'
import { Badge } from '@noter/ui/components/badge'
import type { Document } from '@/types/document'
import { DocumentCardMenu } from './DocumentCardMenu'
import { getCustomCover } from '@/utils/feature/documents/cover'

interface DocumentCardProps {
  document: Document
}

const COVERS = [
  '/covers/blue.svg',
  '/covers/green.svg',
  '/covers/pink.svg',
  '/covers/puper.svg',
  '/covers/yellow.svg'
] as const

/** 根据文档 ID 计算稳定 hash，让同一文档每次都拿到同一张默认封面 */
function pickDefaultCover(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return COVERS[Math.abs(hash) % COVERS.length]
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export default function DocumentCard({ document }: DocumentCardProps) {
  const displayTitle = truncate(document.title, 50)
  const visibleTags = document.tags.slice(0, 3)
  const extraTagCount = document.tags.length - 3
  const defaultCover = pickDefaultCover(document.id)
  const [cover, setCover] = useState<string>(defaultCover)

  // 客户端挂载后读取自定义封面，并监听更新事件
  useEffect(() => {
    const sync = () => {
      const custom = getCustomCover(document.id)
      setCover(custom ?? defaultCover)
    }
    sync()

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId: string }>).detail
      if (detail?.documentId === document.id) sync()
    }
    window.addEventListener('noter:cover-updated', handler)
    return () => window.removeEventListener('noter:cover-updated', handler)
  }, [document.id, defaultCover])

  return (
    <Link href={`/documents/${document.id}`} className='block'>
      <Card className='relative flex aspect-[2/3] max-w-[160px] cursor-pointer flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg'>
        {/* 完整背景封面图（保持原貌，不模糊不缩放） */}
        <div
          className='absolute inset-0 bg-cover bg-center'
          style={{ backgroundImage: `url(${cover})` }}
          aria-hidden
        />

        {/* 左上角操作按钮 */}
        <div className='absolute top-1.5 left-1.5 z-10'>
          <DocumentCardMenu documentId={document.id} />
        </div>

        {/* 底部文字区毛玻璃面板：仅覆盖文字区域，顶部羽化过渡 */}
        <div
          className='absolute inset-x-0 bottom-0 backdrop-blur-md backdrop-saturate-150'
          style={{
            paddingTop: '8px',
            WebkitMaskImage: 'linear-gradient(to top, black 70%, transparent 100%)',
            maskImage: 'linear-gradient(to top, black 70%, transparent 100%)',
            backgroundColor: 'rgba(255,255,255,0.35)'
          }}
          aria-hidden>
          {/* 占位高度由内层文字撑开 */}
          <div className='invisible flex flex-col gap-1.5 p-3'>
            <h3 className='line-clamp-2 text-sm leading-snug font-semibold'>{displayTitle}</h3>
            {visibleTags.length > 0 && (
              <div className='flex flex-wrap items-center gap-1'>
                {visibleTags.map((tag) => (
                  <Badge key={tag.id} className='px-1.5 py-0 text-[10px]'>
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
            <time className='text-[10px]'>{formatDate(document.createdAt)}</time>
          </div>
        </div>

        {/* 文字内容 */}
        <div className='absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3'>
          <h3
            className='line-clamp-2 text-sm leading-snug font-semibold text-gray-900'
            title={document.title}>
            {displayTitle}
          </h3>
          {visibleTags.length > 0 && (
            <div className='flex flex-wrap items-center gap-1'>
              {visibleTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant='secondary'
                  className='border-white/40 bg-white/60 px-1.5 py-0 text-[10px] text-gray-800 backdrop-blur-sm'>
                  {tag.name}
                </Badge>
              ))}
              {extraTagCount > 0 && (
                <span className='text-[10px] text-gray-700'>+{extraTagCount}</span>
              )}
            </div>
          )}
          <time className='text-[10px] text-gray-700'>{formatDate(document.createdAt)}</time>
        </div>
      </Card>
    </Link>
  )
}
