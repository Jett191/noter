'use client'

import { Button } from '@noter/ui/components/button'
import { FileText, Upload } from 'lucide-react'

interface EmptyStateProps {
  onUpload: () => void
}

export function EmptyState({ onUpload }: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center px-4 py-24'>
      <FileText className='text-muted-foreground mb-6 h-16 w-16' />
      <h3 className='mb-2 text-xl font-semibold'>暂无文档</h3>
      <p className='text-muted-foreground mb-6 text-sm'>上传您的第一份文档，开始智能管理</p>
      <Button onClick={onUpload}>
        <Upload className='mr-2 h-4 w-4' />
        上传文档
      </Button>
    </div>
  )
}
