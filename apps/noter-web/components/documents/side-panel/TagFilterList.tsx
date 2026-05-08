'use client'

import { Badge } from '@noter/ui/components/badge'
import { useTagStore } from '@/stores/tags'
import { useDocumentStore } from '@/stores/document'

export function TagFilterList() {
  const { tags } = useTagStore()
  const { selectedTags, setSelectedTags } = useDocumentStore()

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter((id) => id !== tagId))
    } else {
      setSelectedTags([...selectedTags, tagId])
    }
  }

  return (
    <div className='space-y-3'>
      <h3 className='text-sm font-medium'>标签筛选</h3>

      <div className='flex flex-wrap gap-1.5'>
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag.id)
          return (
            <Badge
              key={tag.id}
              variant={isSelected ? 'default' : 'outline'}
              className='cursor-pointer select-none'
              onClick={() => toggleTag(tag.id)}>
              {tag.name}
            </Badge>
          )
        })}

        {tags.length === 0 && <p className='text-muted-foreground text-xs'>暂无标签</p>}
      </div>
    </div>
  )
}
