'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDocumentStore } from '@/stores/document'
import { useTagStore } from '@/stores/tags'
import { useFolderStore } from '@/stores/folders'
import { FilterSortBar } from '@/components/documents/FilterSortBar'
import { FolderSidebar } from '@/components/documents/FolderSidebar'
import DocumentGrid from '@/components/documents/DocumentGrid'
import { UploadDialog } from '@/components/documents/UploadDialog'
import { TagFilterList } from '@/components/documents/side-panel/TagFilterList'
import { DocumentsHeader } from '@/components/documents/DocumentsHeader'
import { Button } from '@noter/ui/components/button'
import { Spinner } from '@noter/ui/components/spinner'

export default function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const {
    documents,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    fetchDocuments,
    loadMore,
    reset
  } = useDocumentStore()
  const { fetchTags } = useTagStore()
  const { fetchFolders, selectedFolderId, setSelectedFolder } = useFolderStore()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const folderIdParam = searchParams.get('folderId')

  // URL → store 单向同步：仅在 folderIdParam 变化时把 store 设成 URL 的值
  useEffect(() => {
    setSelectedFolder(folderIdParam || null)
  }, [folderIdParam, setSelectedFolder])

  // store → URL 单向同步：sidebar 等改变了选中文件夹时把 URL 也改一下
  useEffect(() => {
    const current = folderIdParam || null
    if (current === selectedFolderId) return
    const params = new URLSearchParams(searchParams.toString())
    if (selectedFolderId) {
      params.set('folderId', selectedFolderId)
    } else {
      params.delete('folderId')
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // 仅在 selectedFolderId 真正变化时同步，不依赖 searchParams 防止抖动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId])

  useEffect(() => {
    fetchDocuments()
    fetchTags()
    fetchFolders()
  }, [fetchDocuments, fetchTags, fetchFolders])

  // 当选中文件夹变化时重新获取文档
  useEffect(() => {
    reset()
  }, [selectedFolderId, reset])

  return (
    <div className='flex min-h-screen flex-col px-6'>
      <DocumentsHeader onUpload={() => setUploadOpen(true)} />

      <div className='flex flex-1 gap-6 pb-6'>
        {/* 左侧文件夹导航 */}
        <aside className='w-60 shrink-0'>
          <div className='bg-card sticky top-20 rounded-3xl p-5 shadow-sm'>
            <FolderSidebar />
          </div>
        </aside>

        {/* 中间主内容 */}
        <div className='flex-1 overflow-y-auto'>
          {/* Notion 风格筛选排序栏 */}
          <div className='mb-6'>
            <FilterSortBar />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className='bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-2xl p-4'>
              <span>{error}</span>
              <Button variant='outline' size='sm' onClick={() => fetchDocuments()}>
                重试
              </Button>
            </div>
          )}

          {/* 文档卡片网格 */}
          <DocumentGrid
            documents={documents}
            loading={loading}
            onUpload={() => setUploadOpen(true)}
          />

          {/* 加载更多 */}
          {hasMore && !loading && (
            <div className='flex justify-center py-6'>
              <Button variant='outline' onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Spinner data-icon='inline-start' />}
                {loadingMore ? '加载中...' : `加载更多（共 ${total} 篇）`}
              </Button>
            </div>
          )}

          {/* 已加载全部提示 */}
          {!hasMore && documents.length > 0 && !loading && (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              已显示全部 {total} 篇文档
            </p>
          )}

          <UploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onUploadComplete={() => reset()}
          />
        </div>

        {/* 右侧标签筛选 */}
        <aside className='w-60 shrink-0'>
          <div className='sticky top-20'>
            <p className='text-muted-foreground mb-3 px-1 text-xs font-medium tracking-wider uppercase'>
              标签筛选
            </p>
            <TagFilterList />
          </div>
        </aside>
      </div>
    </div>
  )
}
