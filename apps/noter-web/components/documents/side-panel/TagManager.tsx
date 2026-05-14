'use client'

import { useEffect, useState } from 'react'
import { Input } from '@noter/ui/components/input'
import { Button } from '@noter/ui/components/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@noter/ui/components/alert-dialog'
import { Badge } from '@noter/ui/components/badge'
import { Plus, Trash2 } from 'lucide-react'
import { useTagStore } from '@/stores/tags'

export function TagManager() {
  const { tags, fetchTags, createTag, deleteTag } = useTagStore()
  const [newTagName, setNewTagName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim()

    if (!trimmed) {
      setError('标签名称不能为空')
      return
    }

    if (trimmed.length > 20) {
      setError('标签名称不能超过 20 个字符')
      return
    }

    const isDuplicate = tags.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) {
      setError('标签名称已存在')
      return
    }

    setError(null)
    await createTag(trimmed)
    setNewTagName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateTag()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTagName(e.target.value)
    if (error) setError(null)
  }

  return (
    <div className='space-y-3'>
      <h3 className='text-sm font-medium'>标签管理</h3>

      {/* 新增标签输入 */}
      <div className='flex gap-2'>
        <Input
          value={newTagName}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder='输入标签名称'
          className='h-8 text-xs'
          maxLength={20}
        />
        <Button size='sm' variant='outline' onClick={handleCreateTag} className='h-8 shrink-0 px-2'>
          <Plus className='h-4 w-4' />
        </Button>
      </div>

      {/* 错误提示 */}
      {error && <p className='text-destructive text-xs'>{error}</p>}

      {/* 标签列表 */}
      <div className='space-y-1.5'>
        {tags.map((tag) => (
          <div key={tag.id} className='group flex items-center justify-between'>
            <div className='flex min-w-0 items-center gap-2'>
              <Badge variant='secondary' className='shrink-0 text-xs'>
                {tag.name}
              </Badge>
              <span className='text-muted-foreground text-xs'>{tag.documentCount ?? 0}</span>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100'>
                  <Trash2 className='text-muted-foreground h-3 w-3' />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除标签</AlertDialogTitle>
                  <AlertDialogDescription>
                    确定要删除标签「{tag.name}」吗？删除后将解除与所有文档的关联，此操作不可撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction variant='destructive' onClick={() => deleteTag(tag.id)}>
                    删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}

        {tags.length === 0 && (
          <p className='text-muted-foreground py-2 text-center text-xs'>暂无标签</p>
        )}
      </div>
    </div>
  )
}
