'use client'

import { Button } from '@noter/ui/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@noter/ui/components/select'

interface PaginationControllerProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function getPageNumbers(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = []

  let start = Math.max(1, current - 2)
  let end = Math.min(totalPages, current + 2)

  if (current <= 3) {
    start = 1
    end = 5
  } else if (current >= totalPages - 2) {
    start = totalPages - 4
    end = totalPages
  }

  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push('...')
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push('...')
    pages.push(totalPages)
  }

  return pages
}

export function PaginationController({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange
}: PaginationControllerProps) {
  const totalPages = Math.ceil(total / pageSize)
  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div className='flex items-center justify-between gap-4 py-4'>
      <span className='text-muted-foreground text-sm'>共 {total} 条</span>

      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}>
          &lt; Prev
        </Button>

        {pageNumbers.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className='text-muted-foreground px-1 text-sm'>
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size='sm'
              onClick={() => onPageChange(p)}>
              {p}
            </Button>
          )
        )}

        <Button
          variant='outline'
          size='sm'
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}>
          Next &gt;
        </Button>
      </div>

      <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
        <SelectTrigger size='sm'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size} 条/页
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
