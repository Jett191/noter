'use client'

import { useState } from 'react'
import { Badge } from '@noter/ui/components/badge'
import type { Document, Tag } from '@/types/document'
import { Calendar, FileText, Globe, Hash, Tag as TagIcon, X } from 'lucide-react'
import { useDocumentDetailStore } from '@/stores/documentDetail'
import { DocumentTagPicker } from './DocumentTagPicker'

interface DocumentMetaProps {
  document: Document
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

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function RemovableTagBadge({ tag }: { tag: Tag }) {
  const removeTagFromDocument = useDocumentDetailStore((s) => s.removeTagFromDocument)
  const [removing, setRemoving] = useState(false)

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRemoving(true)
    try {
      await removeTagFromDocument(tag.id)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Badge variant='secondary' className='group h-5 gap-1 pr-1 text-[11px] font-normal'>
      <span className='truncate'>{tag.name}</span>
      <button
        type='button'
        onClick={handleRemove}
        disabled={removing}
        aria-label={`移除标签 ${tag.name}`}
        className='hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors disabled:opacity-50'>
        <X className='h-2.5 w-2.5' />
      </button>
    </Badge>
  )
}

export default function DocumentMeta({ document }: DocumentMetaProps) {
  return (
    <div className='text-muted-foreground flex flex-col gap-3 text-sm'>
      <div className='flex items-center gap-2'>
        <Calendar className='h-4 w-4 shrink-0' />
        <span>创建时间：{formatDate(document.createdAt)}</span>
      </div>

      <div className='flex items-center gap-2'>
        <FileText className='h-4 w-4 shrink-0' />
        <span>文件大小：{formatFileSize(document.fileSize)}</span>
      </div>

      <div className='flex items-center gap-2'>
        <Globe className='h-4 w-4 shrink-0' />
        <span>语言：{document.language || '未知'}</span>
      </div>

      <div className='flex items-center gap-2'>
        <Hash className='h-4 w-4 shrink-0' />
        <span>字数：{document.wordCount.toLocaleString()}</span>
      </div>

      {/* 标签区域：始终展示，包含管理入口 */}
      <div className='space-y-2 pt-1'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <TagIcon className='h-4 w-4 shrink-0' />
            <span>标签</span>
          </div>
          <DocumentTagPicker />
        </div>
        <div className='flex flex-wrap items-center gap-1.5'>
          {document.tags.length === 0 ? (
            <span className='text-muted-foreground/70 text-xs'>暂无标签</span>
          ) : (
            document.tags.map((tag) => <RemovableTagBadge key={tag.id} tag={tag} />)
          )}
        </div>
      </div>
    </div>
  )
}
