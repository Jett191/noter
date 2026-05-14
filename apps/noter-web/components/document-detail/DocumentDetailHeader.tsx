'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, MessageSquare, User } from 'lucide-react'
import { Button } from '@noter/ui/components/button'
import { Separator } from '@noter/ui/components/separator'
import { useUserStore } from '@/stores/user'
import { useFolderStore } from '@/stores/folders'
import type { Document, TemplateType } from '@/types/document'
import type { Folder } from '@/types/folder'
import { TemplateSwitcher } from './TemplateSwitcher'
import { DownloadButton } from './DownloadButton'

interface DocumentDetailHeaderProps {
  document: Document
  template: TemplateType
  onTemplateChange: (template: TemplateType) => void
  panelVisible: boolean
  onTogglePanel: () => void
}

/** 由当前文件夹向上回溯，得到从根到当前的文件夹链 */
function buildFolderTrail(folders: Folder[], folderId: string | null): Folder[] {
  if (!folderId) return []
  const map = new Map(folders.map((f) => [f.id, f]))
  const trail: Folder[] = []
  let current = map.get(folderId)
  // 防御循环引用，最多向上 16 层
  let safety = 0
  while (current && safety < 16) {
    trail.unshift(current)
    current = current.parentId ? map.get(current.parentId) : undefined
    safety += 1
  }
  return trail
}

export function DocumentDetailHeader({
  document,
  template,
  onTemplateChange,
  panelVisible,
  onTogglePanel
}: DocumentDetailHeaderProps) {
  const router = useRouter()
  const user = useUserStore((s) => s.user)
  const folders = useFolderStore((s) => s.folders)

  const folderTrail = useMemo(
    () => buildFolderTrail(folders, document.folderId),
    [folders, document.folderId]
  )

  const rootName = user?.username || '我的文档'

  return (
    <header className='bg-background/80 sticky top-0 z-30 border-b backdrop-blur'>
      <div className='flex h-14 items-center gap-3 px-6'>
        {/* 返回按钮 → 用户的所有文档页 */}
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={() => router.push('/documents')}
          aria-label='返回文档列表'>
          <ArrowLeft className='h-4 w-4' />
        </Button>

        <Separator orientation='vertical' className='!h-5' />

        {/* 面包屑路径 */}
        <nav aria-label='面包屑' className='flex min-w-0 flex-1 items-center gap-1.5 text-sm'>
          <Link
            href='/documents'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors'>
            <User className='h-3.5 w-3.5' />
            <span className='max-w-[160px] truncate'>{rootName}</span>
          </Link>

          {folderTrail.map((folder) => (
            <span key={folder.id} className='flex items-center gap-1.5'>
              <ChevronRight className='text-muted-foreground/50 h-3.5 w-3.5 shrink-0' />
              <Link
                href={`/documents?folderId=${folder.id}`}
                className='text-muted-foreground hover:text-foreground max-w-[160px] truncate transition-colors'>
                {folder.name}
              </Link>
            </span>
          ))}

          <ChevronRight className='text-muted-foreground/50 h-3.5 w-3.5 shrink-0' />
          <span
            className='text-foreground min-w-0 flex-1 truncate font-medium'
            title={document.title}>
            {document.title}
          </span>
        </nav>

        {/* 右侧操作集合：样式切换 / 下载 / AI */}
        <div className='flex items-center gap-2'>
          <TemplateSwitcher template={template} onTemplateChange={onTemplateChange} />
          <Separator orientation='vertical' className='h-5' />
          <DownloadButton title={document.title} />
          <Button
            variant={panelVisible ? 'default' : 'outline'}
            size='sm'
            onClick={onTogglePanel}
            aria-pressed={panelVisible}
            aria-label='AI 问答'>
            <MessageSquare className='h-4 w-4' />
            <span className='ml-1.5'>AI 问答</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
