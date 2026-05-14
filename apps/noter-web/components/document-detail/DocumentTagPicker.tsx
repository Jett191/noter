'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, Loader2 } from 'lucide-react'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { Popover, PopoverContent, PopoverTrigger } from '@noter/ui/components/popover'
import { ScrollArea } from '@noter/ui/components/scroll-area'
import { Separator } from '@noter/ui/components/separator'
import { useTagStore } from '@/stores/tags'
import { useDocumentDetailStore } from '@/stores/documentDetail'
import type { Tag } from '@/types/document'

/**
 * 文档详情页：为当前文档添加标签的选择器
 * - 显示所有用户标签，已选标签打勾
 * - 支持搜索过滤
 * - 支持快速创建新标签并立即添加到当前文档
 */
export function DocumentTagPicker() {
  const { tags, fetchTags, createTag } = useTagStore()
  const { document, addTagToDocument } = useDocumentDetailStore()

  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [busyTagId, setBusyTagId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchTags()
      setKeyword('')
      setErrorMsg(null)
    }
  }, [open, fetchTags])

  const docTagIds = useMemo(() => new Set((document?.tags ?? []).map((t) => t.id)), [document])

  const trimmed = keyword.trim()

  const filteredTags = useMemo(() => {
    if (!trimmed) return tags
    const lower = trimmed.toLowerCase()
    return tags.filter((t) => t.name.toLowerCase().includes(lower))
  }, [tags, trimmed])

  const exactMatch = trimmed
    ? tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    : null

  const canCreate = trimmed.length > 0 && trimmed.length <= 20 && !exactMatch

  const handleToggle = async (tag: Tag) => {
    if (docTagIds.has(tag.id)) return
    setBusyTagId(tag.id)
    setErrorMsg(null)
    try {
      await addTagToDocument(tag)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusyTagId(null)
    }
  }

  const handleCreateAndAdd = async () => {
    if (!canCreate) return
    setCreating(true)
    setErrorMsg(null)
    try {
      await createTag(trimmed)
      // createTag 会刷新 tags 列表，从最新列表中找到新建的标签
      const refreshed = useTagStore.getState().tags
      const created = refreshed.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
      if (created) {
        await addTagToDocument(created)
        setKeyword('')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='xs' className='h-6 gap-1 px-2 text-[11px]'>
          <Plus className='h-3 w-3' />
          添加标签
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-60 p-2' align='start'>
        <div className='space-y-2'>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder='搜索或新建标签'
            className='h-8 text-xs'
            maxLength={20}
            autoFocus
          />

          <Separator />

          <ScrollArea className='max-h-48'>
            <div className='space-y-0.5'>
              {filteredTags.length === 0 && !canCreate && (
                <p className='text-muted-foreground px-2 py-2 text-center text-xs'>暂无标签</p>
              )}

              {filteredTags.map((tag) => {
                const selected = docTagIds.has(tag.id)
                const busy = busyTagId === tag.id
                return (
                  <button
                    key={tag.id}
                    type='button'
                    disabled={selected || busy}
                    onClick={() => handleToggle(tag)}
                    className='hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-default disabled:opacity-70'>
                    <span className='truncate'>{tag.name}</span>
                    {busy ? (
                      <Loader2 className='text-muted-foreground h-3 w-3 animate-spin' />
                    ) : selected ? (
                      <Check className='text-primary h-3 w-3' />
                    ) : null}
                  </button>
                )
              })}

              {canCreate && (
                <button
                  type='button'
                  disabled={creating}
                  onClick={handleCreateAndAdd}
                  className='hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-70'>
                  <span className='truncate'>
                    创建并添加「<span className='font-medium'>{trimmed}</span>」
                  </span>
                  {creating ? (
                    <Loader2 className='text-muted-foreground h-3 w-3 animate-spin' />
                  ) : (
                    <Plus className='text-muted-foreground h-3 w-3' />
                  )}
                </button>
              )}
            </div>
          </ScrollArea>

          {errorMsg && <p className='text-destructive px-1 text-[11px]'>{errorMsg}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
