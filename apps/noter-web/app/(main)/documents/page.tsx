'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDocumentStore } from '@/stores/document'
import { useTagStore } from '@/stores/tags'
import { useFolderStore } from '@/stores/folders'
import { SearchBar } from '@/components/documents/SearchBar'
import { FilterSortBar } from '@/components/documents/FilterSortBar'
import { FolderSidebar } from '@/components/documents/FolderSidebar'
import DocumentGrid from '@/components/documents/DocumentGrid'
import { UploadDialog } from '@/components/documents/UploadDialog'
import { UserAvatarDropdown } from '@/components/documents/UserAvatarDropdown'
import { TagFilterList } from '@/components/documents/side-panel/TagFilterList'
import { TagManager } from '@/components/documents/side-panel/TagManager'
import { Button } from '@noter/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@noter/ui/components/card'
import { Separator } from '@noter/ui/components/separator'
import { Spinner } from '@noter/ui/components/spinner'
import { Upload } from 'lucide-react'

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

  const searchParams = useSearchParams()
  const folderIdParam = searchParams.get('folderId')

  // 当从外部带 folderId 进入时，同步到 store
  useEffect(() => {
    const next = folderIdParam || null
    if (next !== selectedFolderId) {
      setSelectedFolder(next)
    }
  }, [folderIdParam, selectedFolderId, setSelectedFolder])

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
    <div className='flex h-full'>
      {/* 左侧文件夹导航 */}
      <aside className='border-r p-4'>
        <FolderSidebar />
      </aside>

      {/* 中间主内容 */}
      <div className='flex-1 overflow-y-auto p-6'>
        {/* 顶部：搜索 + 上传 + 用户头像 */}
        <div className='mb-4 flex items-center gap-4'>
          <SearchBar />
          <Button onClick={() => setUploadOpen(true)} className='shrink-0'>
            <Upload data-icon='inline-start' />
            上传文档
          </Button>
          <UserAvatarDropdown />
        </div>

        {/* Notion 风格筛选排序栏 */}
        <FilterSortBar />

        {/* 分界线 */}
        <Separator className='my-2' />

        {/* 错误提示 */}
        {error && (
          <div className='bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-md p-4'>
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

      {/* 右侧标签筛选 + 标签管理 */}
      <aside className='w-56 shrink-0 space-y-4 border-l p-4'>
        <Card className='sticky top-4'>
          <CardHeader className='px-3 py-3'>
            <CardTitle className='text-sm'>标签筛选</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4 px-3 pb-3'>
            <TagFilterList />
            <Separator />
            <TagManager />
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
