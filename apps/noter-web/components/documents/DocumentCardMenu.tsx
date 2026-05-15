'use client'

import { useRef, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@noter/ui/components/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@noter/ui/components/alert-dialog'
import { MoreHorizontal, ImageIcon, Trash2, RotateCcw } from 'lucide-react'
import { useDocumentStore } from '@/stores/document'
import {
  compressImageToDataURL,
  getCustomCover,
  removeCustomCover,
  setCustomCover
} from '@/utils/feature/documents/cover'

interface DocumentCardMenuProps {
  documentId: string
}

export function DocumentCardMenu({ documentId }: DocumentCardMenuProps) {
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePickImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    try {
      const dataUrl = await compressImageToDataURL(file)
      setCustomCover(documentId, dataUrl)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存封面失败')
    } finally {
      e.target.value = ''
    }
  }

  const handleResetCover = (e: Event) => {
    e.stopPropagation()
    if (getCustomCover(documentId)) {
      removeCustomCover(documentId)
    }
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await deleteDocument(documentId)
      setConfirmOpen(false)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const hasCustomCover = typeof window !== 'undefined' && !!getCustomCover(documentId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          className='flex size-6 items-center justify-center rounded-md text-white/90 transition-all hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none'
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
          aria-label='文档操作'>
          <MoreHorizontal className='size-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-44' onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={handlePickImage}>
              <ImageIcon data-icon='inline-start' />
              更换背景图
            </DropdownMenuItem>
            {hasCustomCover && (
              <DropdownMenuItem onSelect={handleResetCover}>
                <RotateCcw data-icon='inline-start' />
                恢复默认封面
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant='destructive'
            onSelect={(e) => {
              e.preventDefault()
              setConfirmOpen(true)
            }}>
            <Trash2 data-icon='inline-start' />
            删除文档
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleFileChange}
        onClick={(e) => e.stopPropagation()}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该文档？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后文档将进入回收站，可在管理后台恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleConfirmDelete}
              disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
