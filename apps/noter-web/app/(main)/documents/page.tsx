'use client'

import { useEffect, useState } from 'react'
import { useDocumentStore } from '@/stores/document'
import { useTagStore } from '@/stores/tags'
import { useFolderStore } from '@/stores/folders'
import { SearchBar } from '@/components/documents/SearchBar'
import { FilterSortBar } from '@/components/documents/FilterSortBar'
import { FolderSidebar } from '@/components/documents/FolderSidebar'
import DocumentGrid from '@/components/documents/DocumentGrid'
import { PaginationController } from '@/components/documents/PaginationController'
import { UploadDialog } from '@/components/documents/UploadDialog'
import { UserAvatarDropdown } from '@/components/documents/UserAvatarDropdown'
import { Button } from '@noter/ui/components/button'
import { Separator } from '@noter/ui/components/separator'
import { Upload } from 'lucide-react'

export default function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const { documents, total, page, pageSize, loading, error, fetchDocuments } = useDocumentStore()
  const { setPage, setPageSize } = useDocumentStore()
  const { fetchTags } = useTagStore()
  const { fetchFolders, selectedFolderId } = useFolderStore()

  useEffect(() => {
    fetchDocuments()
    fetchTags()
    fetchFolders()
  }, [fetchDocuments, fetchTags, fetchFolders])

  // 当选中文件夹变化时重新获取文档
  useEffect(() => {
    fetchDocuments()
  }, [selectedFolderId, fetchDocuments])

  return (
    <div className='flex h-full'>
      {/* 左侧文件夹导航 */}
      <aside className='border-r p-4'>
        <FolderSidebar />
      </aside>

      {/* 右侧主内容 */}
      <div className='flex-1 p-6'>
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

        {/* 分页 */}
        {total > 0 && (
          <PaginationController
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}

        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploadComplete={() => fetchDocuments()}
        />
      </div>
    </div>
  )
}
