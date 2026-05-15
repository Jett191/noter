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
import { MoreHorizontal, ImageIcon, Trash2, RotateCcw, Loader2 } from 'lucide-react'
import { useDocumentStore } from '@/stores/document'

const MAX_COVER_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface DocumentCardMenuProps {
  documentId: string
  hasCustomCover: boolean
}

export function DocumentCardMenu({ documentId, hasCustomCover }: DocumentCardMenuProps) {
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)
  const uploadCover = useDocumentStore((s) => s.uploadCover)
  const resetCover = useDocumentStore((s) => s.resetCover)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePickImage = (e: Event) => {
    e.preventDefault()
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('仅支持 JPG、PNG、WebP、GIF 格式')
      return
    }
    if (file.size > MAX_COVER_SIZE) {
      alert('封面文件不能超过 5MB')
      return
    }

    setUploading(true)
    try {
      await uploadCover(documentId, file)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '封面上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleResetCover = async (e: Event) => {
    e.preventDefault()
    try {
      await resetCover(documentId)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '恢复默认封面失败')
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
          {uploading ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <MoreHorizontal className='size-4' />
          )}
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
        accept='image/jpeg,image/png,image/webp,image/gif'
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
