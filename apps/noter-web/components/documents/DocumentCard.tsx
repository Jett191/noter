'use client'

import Link from 'next/link'
import { Card, CardHeader, CardContent } from '@noter/ui/components/card'
import { Badge } from '@noter/ui/components/badge'
import type { Document } from '@/types/document'

interface DocumentCardProps {
  document: Document
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
  const displayDescription = document.shortDescription
    ? truncate(document.shortDescription, 100)
    : null
  const visibleTags = document.tags.slice(0, 3)
  const extraTagCount = document.tags.length - 3

  return (
    <Link href={`/documents/${document.id}`} className='block'>
      <Card className='cursor-pointer transition-shadow hover:shadow-md'>
        <CardHeader>
          <div className='flex flex-col gap-1'>
            <h3 className='text-base leading-snug font-medium' title={document.title}>
              {displayTitle}
            </h3>
            <time className='text-muted-foreground text-xs'>{formatDate(document.createdAt)}</time>
          </div>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {visibleTags.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5'>
              {visibleTags.map((tag) => (
                <Badge key={tag.id} variant='secondary'>
                  {tag.name}
                </Badge>
              ))}
              {extraTagCount > 0 && (
                <span className='text-muted-foreground text-xs'>+{extraTagCount}</span>
              )}
            </div>
          )}
          {displayDescription && (
            <p className='text-muted-foreground line-clamp-2 text-sm'>{displayDescription}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
