'use client'

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import { Input } from '@noter/ui/components/input'
import { cn } from '@noter/ui/lib/utils'
import { Folder, FolderPlus, MoreHorizontal, Pencil, Trash2, FileText } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@noter/ui/components/popover'
import { useFolderStore } from '@/stores/folders'
import type { Folder as FolderType } from '@/types/folder'

export function FolderSidebar() {
  const { folders, selectedFolderId, setSelectedFolder, createFolder, deleteFolder, renameFolder } =
    useFolderStore()
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    await createFolder(trimmed)
    setNewName('')
    setShowNewInput(false)
  }

  const handleRename = async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditingId(null)
      return
    }
    await renameFolder(id, trimmed)
    setEditingId(null)
  }

  const startEdit = (folder: FolderType) => {
    setEditingId(folder.id)
    setEditName(folder.name)
  }

  return (
    <div className='w-52 shrink-0 space-y-1'>
      <div className='flex items-center justify-between px-2 py-1'>
        <span className='text-muted-foreground text-xs font-medium uppercase tracking-wider'>文件夹</span>
        <Button
          variant='ghost'
          size='sm'
          className='h-6 w-6 p-0'
          onClick={() => setShowNewInput(true)}>
          <FolderPlus className='h-3.5 w-3.5' />
        </Button>
      </div>

      {/* 全部文档 */}
      <button
        type='button'
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          'hover:bg-accent',
          selectedFolderId === null ? 'bg-accent font-medium' : 'text-muted-foreground'
        )}
        onClick={() => setSelectedFolder(null)}>
        <FileText className='h-4 w-4' />
        <span className='flex-1 truncate'>全部文档</span>
      </button>

      {/* 文件夹列表 */}
      {folders.map((folder) => (
        <div key={folder.id} className='group relative'>
          {editingId === folder.id ? (
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(folder.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={() => handleRename(folder.id)}
              className='h-8 text-sm'
            />
          ) : (
            <button
              type='button'
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                'hover:bg-accent',
                selectedFolderId === folder.id ? 'bg-accent font-medium' : 'text-muted-foreground'
              )}
              onClick={() => setSelectedFolder(folder.id)}>
              <Folder className='h-4 w-4 shrink-0' />
              <span className='flex-1 truncate'>{folder.name}</span>
              {folder.documentCount !== undefined && folder.documentCount > 0 && (
                <span className='text-muted-foreground text-[10px]'>{folder.documentCount}</span>
              )}
            </button>
          )}

          {/* 操作菜单 */}
          {editingId !== folder.id && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  className='absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 p-0 opacity-0 transition-opacity group-hover:opacity-100'>
                  <MoreHorizontal className='h-3 w-3' />
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-32 p-1' align='end'>
                <button
                  type='button'
                  className='hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm'
                  onClick={() => startEdit(folder)}>
                  <Pencil className='h-3 w-3' />
                  重命名
                </button>
                <button
                  type='button'
                  className='hover:bg-destructive/10 text-destructive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm'
                  onClick={() => deleteFolder(folder.id)}>
                  <Trash2 className='h-3 w-3' />
                  删除
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      ))}

      {/* 新建文件夹输入 */}
      {showNewInput && (
        <div className='px-1'>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setShowNewInput(false)
                setNewName('')
              }
            }}
            onBlur={() => {
              if (!newName.trim()) setShowNewInput(false)
            }}
            placeholder='文件夹名称'
            className='h-8 text-sm'
            maxLength={50}
          />
        </div>
      )}
    </div>
  )
}
