'use client'

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import { Badge } from '@noter/ui/components/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@noter/ui/components/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@noter/ui/components/select'
import { ListFilter, ArrowUpDown, X } from 'lucide-react'
import { useTagStore } from '@/stores/tags'
import { useDocumentStore } from '@/stores/document'

type SortField = 'created_at' | 'title' | 'file_size'
type SortOrder = 'asc' | 'desc'

interface ActiveFilter {
  type: 'tag'
  tagId: string
  tagName: string
}

export function FilterSortBar() {
  const { tags } = useTagStore()
  const { selectedTags, setSelectedTags, fetchDocuments } = useDocumentStore()
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  // 构建活跃的筛选条件
  const activeFilters: ActiveFilter[] = selectedTags.map((tagId) => {
    const tag = tags.find((t) => t.id === tagId)
    return { type: 'tag', tagId, tagName: tag?.name ?? '未知' }
  })

  const addTagFilter = (tagId: string) => {
    if (!selectedTags.includes(tagId)) {
      setSelectedTags([...selectedTags, tagId])
    }
    setFilterOpen(false)
  }

  const removeFilter = (tagId: string) => {
    setSelectedTags(selectedTags.filter((id) => id !== tagId))
  }

  const handleSortChange = (field: SortField, order: SortOrder) => {
    setSortField(field)
    setSortOrder(order)
    // 更新 store 并重新获取
    const store = useDocumentStore.getState()
    store.fetchDocuments()
    setSortOpen(false)
  }

  const sortLabel: Record<SortField, string> = {
    created_at: '创建时间',
    title: '标题',
    file_size: '文件大小'
  }

  return (
    <div className='flex items-center gap-2 py-1.5'>
      {/* 筛选按钮 */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground h-7 gap-1.5 text-xs font-normal'>
            <ListFilter className='h-3.5 w-3.5' />
            筛选
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-52 p-2' align='start'>
          <div className='space-y-1'>
            <p className='text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase'>
              按标签筛选
            </p>
            {tags.length === 0 ? (
              <p className='text-muted-foreground px-2 py-2 text-xs'>暂无标签</p>
            ) : (
              tags.map((tag) => (
                <button
                  key={tag.id}
                  type='button'
                  className='hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors'
                  onClick={() => addTagFilter(tag.id)}>
                  <span>{tag.name}</span>
                  {selectedTags.includes(tag.id) && <span className='text-primary text-xs'>✓</span>}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 排序按钮 */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground h-7 gap-1.5 text-xs font-normal'>
            <ArrowUpDown className='h-3.5 w-3.5' />
            排序
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-56 p-2' align='start'>
          <div className='space-y-2'>
            <div className='space-y-1'>
              <p className='text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase'>
                排序字段
              </p>
              {(['created_at', 'title', 'file_size'] as SortField[]).map((field) => (
                <button
                  key={field}
                  type='button'
                  className={`hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${sortField === field ? 'bg-accent' : ''}`}
                  onClick={() => handleSortChange(field, sortOrder)}>
                  <span>{sortLabel[field]}</span>
                  {sortField === field && <span className='text-primary text-xs'>✓</span>}
                </button>
              ))}
            </div>
            <div className='space-y-1'>
              <p className='text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase'>
                排序方向
              </p>
              <button
                type='button'
                className={`hover:bg-accent flex w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${sortOrder === 'desc' ? 'bg-accent' : ''}`}
                onClick={() => handleSortChange(sortField, 'desc')}>
                降序（最新优先）
              </button>
              <button
                type='button'
                className={`hover:bg-accent flex w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${sortOrder === 'asc' ? 'bg-accent' : ''}`}
                onClick={() => handleSortChange(sortField, 'asc')}>
                升序（最早优先）
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* 当前排序指示 */}
      {sortField !== 'created_at' || sortOrder !== 'desc' ? (
        <Badge variant='secondary' className='h-5 gap-1 text-[10px]'>
          {sortLabel[sortField]} · {sortOrder === 'desc' ? '降序' : '升序'}
        </Badge>
      ) : null}

      {/* 活跃筛选条件 */}
      {activeFilters.length > 0 && (
        <>
          {activeFilters.map((filter) => (
            <Badge key={filter.tagId} variant='secondary' className='h-5 gap-1 pr-1 text-[10px]'>
              {filter.tagName}
              <button
                type='button'
                className='hover:bg-muted-foreground/20 rounded-full p-0.5'
                onClick={() => removeFilter(filter.tagId)}>
                <X className='h-2.5 w-2.5' />
              </button>
            </Badge>
          ))}
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground h-5 text-[10px]'
            onClick={() => setSelectedTags([])}>
            清除全部
          </Button>
        </>
      )}
    </div>
  )
}
