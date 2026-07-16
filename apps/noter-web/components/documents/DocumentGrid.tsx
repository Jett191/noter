'use client'

import { Skeleton } from '@noter/ui/components/skeleton'
import DocumentCard from './DocumentCard'
import { EmptyState } from './EmptyState'
import type { Document } from '@/types/document'

interface DocumentGridProps {
  documents: Document[]
  loading: boolean
  onUpload: () => void
}

function SkeletonCard() {
  return (
    <div className='flex flex-col gap-4 rounded-xl border p-4'>
      <Skeleton className='h-5 w-3/4' />
      <Skeleton className='h-4 w-1/2' />
      <div className='flex gap-2'>
        <Skeleton className='h-5 w-14 rounded-full' />
        <Skeleton className='h-5 w-14 rounded-full' />
        <Skeleton className='h-5 w-14 rounded-full' />
      </div>
      <Skeleton className='h-12 w-full' />
    </div>
  )
}

export default function DocumentGrid({ documents, loading, onUpload }: DocumentGridProps) {
  if (loading) {
    return (
      <div className='grid grid-cols-5 gap-x-2 gap-y-16'>
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return <EmptyState onUpload={onUpload} />
  }

  return (
    <div className='grid grid-cols-5 gap-x-2 gap-y-16'>
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} />
      ))}
    </div>
  )
}
