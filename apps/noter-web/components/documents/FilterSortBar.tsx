'use client'

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import { Badge } from '@noter/ui/components/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@noter/ui/components/popover'
import { ArrowDown, ArrowUp, Check, ChevronDown, Filter, ListFilter, Star, X } from 'lucide-react'
import { cn } from '@noter/ui/lib/utils'
import { useDocumentStore, type SortField } from '@/stores/document'
import { ALLOWED_EXTENSIONS } from '@/utils/feature/documents/schemas'

const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'title', label: '标题' },
  { value: 'file_size', label: '文件大小' },
  { value: 'word_count', label: '字数' }
]

const STATUS_OPTIONS: { value: 'ready' | 'processing' | 'failed'; label: string }[] = [
  { value: 'ready', label: '已就绪' },
  { value: 'processing', label: '处理中' },
  { value: 'failed', label: '处理失败' }
]

const TIME_RANGES: { days: number; label: string }[] = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' }
]

const FILE_EXT_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PPT',
  txt: 'TXT',
  md: 'Markdown'
}

const STATUS_LABEL: Record<string, string> = {
  ready: '已就绪',
  processing: '处理中',
  failed: '处理失败'
}

function timeRangeLabel(days: number | null): string | null {
  if (days == null) return null
  return TIME_RANGES.find((r) => r.days === days)?.label ?? `近 ${days} 天`
}

export function FilterSortBar() {
  const { orderBy, order, setSort, filters, setFilters, resetFilters } = useDocumentStore()
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const sortLabel = SORT_FIELDS.find((f) => f.value === orderBy)?.label ?? '创建时间'
  const isCustomSort = !(orderBy === 'created_at' && order === 'desc')

  // 活跃筛选条件（用于 chip 展示）
  const activeChips: { key: string; label: string; onRemove: () => void }[] = []
  if (filters.status) {
    activeChips.push({
      key: `status:${filters.status}`,
      label: `状态：${STATUS_LABEL[filters.status]}`,
      onRemove: () => setFilters({ status: null })
    })
  }
  if (filters.favoriteOnly) {
    activeChips.push({
      key: 'fav',
      label: '仅看收藏',
      onRemove: () => setFilters({ favoriteOnly: false })
    })
  }
  for (const ext of filters.fileExts) {
    activeChips.push({
      key: `ext:${ext}`,
      label: FILE_EXT_LABEL[ext] ?? ext.toUpperCase(),
      onRemove: () => setFilters({ fileExts: filters.fileExts.filter((e) => e !== ext) })
    })
  }
  const tLabel = timeRangeLabel(filters.createdWithinDays)
  if (tLabel) {
    activeChips.push({
      key: 'time',
      label: `时间：${tLabel}`,
      onRemove: () => setFilters({ createdWithinDays: null })
    })
  }

  const filterCount = activeChips.length

  const toggleFileExt = (ext: string) => {
    if (filters.fileExts.includes(ext)) {
      setFilters({ fileExts: filters.fileExts.filter((e) => e !== ext) })
    } else {
      setFilters({ fileExts: [...filters.fileExts, ext] })
    }
  }

  const setTimeRange = (days: number | null) => {
    setFilters({ createdWithinDays: days })
  }

  const matchedRangeDays = filters.createdWithinDays

  return (
    <div className='flex flex-wrap items-center gap-1.5 py-1.5'>
      {/* === 筛选 === */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'text-muted-foreground h-7 gap-1.5 text-xs font-normal',
              filterCount > 0 && 'text-foreground'
            )}>
            <Filter className='h-3.5 w-3.5' />
            筛选
            {filterCount > 0 && (
              <span className='bg-primary/10 text-primary ml-0.5 rounded-full px-1.5 py-px text-[10px] leading-none font-medium'>
                {filterCount}
              </span>
            )}
            <ChevronDown className='h-3 w-3 opacity-60' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-72 p-3' align='start'>
          {/* 状态 */}
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
              状态
            </p>
            <div className='flex flex-wrap gap-1'>
              {STATUS_OPTIONS.map((opt) => {
                const active = filters.status === opt.value
                return (
                  <button
                    key={opt.value}
                    type='button'
                    onClick={() => setFilters({ status: active ? null : opt.value })}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 文件类型 */}
          <div className='mt-4 space-y-1.5'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
              文件类型
            </p>
            <div className='flex flex-wrap gap-1'>
              {ALLOWED_EXTENSIONS.map((ext) => {
                const active = filters.fileExts.includes(ext)
                return (
                  <button
                    key={ext}
                    type='button'
                    onClick={() => toggleFileExt(ext)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}>
                    {FILE_EXT_LABEL[ext] ?? ext.toUpperCase()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 收藏 */}
          <div className='mt-4 space-y-1.5'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
              其他
            </p>
            <button
              type='button'
              onClick={() => setFilters({ favoriteOnly: !filters.favoriteOnly })}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                'hover:bg-accent'
              )}>
              <span className='flex items-center gap-2'>
                <Star
                  className={cn(
                    'h-3.5 w-3.5',
                    filters.favoriteOnly ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                  )}
                />
                仅看收藏
              </span>
              {filters.favoriteOnly && <Check className='text-primary h-3.5 w-3.5' />}
            </button>
          </div>

          {/* 创建时间 */}
          <div className='mt-4 space-y-1.5'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-wider uppercase'>
              创建时间
            </p>
            <div className='flex flex-wrap gap-1'>
              <button
                type='button'
                onClick={() => setTimeRange(null)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  matchedRangeDays === null
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}>
                全部
              </button>
              {TIME_RANGES.map((r) => {
                const active = matchedRangeDays === r.days
                return (
                  <button
                    key={r.days}
                    type='button'
                    onClick={() => setTimeRange(r.days)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}>
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 重置 */}
          {filterCount > 0 && (
            <div className='mt-4 flex justify-end border-t pt-3'>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 text-xs'
                onClick={() => {
                  resetFilters()
                  setFilterOpen(false)
                }}>
                <X className='mr-1 h-3 w-3' />
                清除全部
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* === 排序 === */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'text-muted-foreground h-7 gap-1.5 text-xs font-normal',
              isCustomSort && 'text-foreground'
            )}>
            <ListFilter className='h-3.5 w-3.5' />
            排序
            {isCustomSort && (
              <span className='text-foreground/80 ml-0.5 inline-flex items-center gap-0.5 text-[11px]'>
                · {sortLabel}
                {order === 'desc' ? (
                  <ArrowDown className='h-3 w-3' />
                ) : (
                  <ArrowUp className='h-3 w-3' />
                )}
              </span>
            )}
            <ChevronDown className='h-3 w-3 opacity-60' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-56 p-2' align='start'>
          <div className='space-y-1'>
            <p className='text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wider uppercase'>
              排序字段
            </p>
            {SORT_FIELDS.map((f) => (
              <button
                key={f.value}
                type='button'
                onClick={() => setSort(f.value, order)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  'hover:bg-accent',
                  orderBy === f.value && 'bg-accent/60'
                )}>
                <span>{f.label}</span>
                {orderBy === f.value && <Check className='text-primary h-3.5 w-3.5' />}
              </button>
            ))}
          </div>
          <div className='mt-2 space-y-1 border-t pt-2'>
            <p className='text-muted-foreground px-2 py-1 text-[11px] font-medium tracking-wider uppercase'>
              方向
            </p>
            <button
              type='button'
              onClick={() => setSort(orderBy, 'desc')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                'hover:bg-accent',
                order === 'desc' && 'bg-accent/60'
              )}>
              <ArrowDown className='h-3.5 w-3.5' />
              降序
              {order === 'desc' && <Check className='text-primary ml-auto h-3.5 w-3.5' />}
            </button>
            <button
              type='button'
              onClick={() => setSort(orderBy, 'asc')}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                'hover:bg-accent',
                order === 'asc' && 'bg-accent/60'
              )}>
              <ArrowUp className='h-3.5 w-3.5' />
              升序
              {order === 'asc' && <Check className='text-primary ml-auto h-3.5 w-3.5' />}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* === 活跃筛选 chip === */}
      {activeChips.map((chip) => (
        <Badge
          key={chip.key}
          variant='secondary'
          className='h-6 gap-1 pr-1 pl-2 text-[11px] font-normal'>
          {chip.label}
          <button
            type='button'
            className='hover:bg-muted-foreground/20 rounded-full p-0.5'
            onClick={chip.onRemove}>
            <X className='h-2.5 w-2.5' />
          </button>
        </Badge>
      ))}
      {activeChips.length > 1 && (
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground h-6 px-2 text-[11px]'
          onClick={resetFilters}>
          清除
        </Button>
      )}
    </div>
  )
}
