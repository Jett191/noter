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
import { ChevronDown } from 'lucide-react'

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

          {/* 加载更多 / 已显示全部 */}
          {(hasMore || documents.length > 0) && !loading && (
            <div
              className='flex items-center gap-6 pl-6'
              style={{ marginTop: '128px', marginBottom: '48px' }}>
              {/* 左侧：副标题 + 主行动 */}
              <div className='flex flex-col items-start gap-1'>
                <span className='text-muted-foreground/80 text-[10px] font-medium tracking-[0.2em] uppercase'>
                  {hasMore ? `${documents.length} / ${total} documents` : `${total} documents`}
                </span>
                {hasMore ? (
                  <button
                    type='button'
                    onClick={loadMore}
                    disabled={loadingMore}
                    className='group text-foreground inline-flex items-center gap-2 text-xl font-semibold tracking-tight transition-opacity disabled:opacity-60'>
                    {loadingMore ? (
                      <>
                        <Spinner data-icon='inline-start' />
                        <span>加载中</span>
                      </>
                    ) : (
                      <>
                        <span className='bg-foreground/10 group-hover:bg-foreground/20 -mx-1 rounded-md px-1 transition-colors'>
                          加载更多
                        </span>
                        <ChevronDown className='size-5 transition-transform duration-200 group-hover:translate-y-0.5' />
                      </>
                    )}
                  </button>
                ) : (
                  <span className='text-foreground/80 text-xl font-semibold tracking-tight'>
                    已经到底啦
                  </span>
                )}
              </div>

              {/* 右侧：渐变分隔线（占满剩余空间） */}
              <div
                className='via-border h-px flex-1 bg-gradient-to-r from-transparent to-transparent'
                aria-hidden
              />
            </div>
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
