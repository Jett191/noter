'use client'

import { useEffect, useState } from 'react'
import { useDocumentStore } from '@/stores/document'
import { useTagStore } from '@/stores/tags'
import { SearchBar } from '@/components/documents/SearchBar'
import { SidePanel } from '@/components/documents/side-panel/SidePanel'
import DocumentGrid from '@/components/documents/DocumentGrid'
import { PaginationController } from '@/components/documents/PaginationController'
import { UploadDialog } from '@/components/documents/UploadDialog'
import { Button } from '@noter/ui/components/button'
import { Upload } from 'lucide-react'

export default function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const { documents, total, page, pageSize, loading, error, fetchDocuments } = useDocumentStore()
  const { setPage, setPageSize } = useDocumentStore()
  const { fetchTags } = useTagStore()

  useEffect(() => {
    fetchDocuments()
    fetchTags()
  }, [fetchDocuments, fetchTags])

  return (
    <div className='flex gap-6 p-6'>
      <SidePanel />

      <div className='flex min-w-0 flex-1 flex-col'>
        <div className='mb-6 flex items-center justify-center gap-4'>
          <SearchBar />
          <Button onClick={() => setUploadOpen(true)} className='shrink-0'>
            <Upload className='mr-2 h-4 w-4' />
            上传文档
          </Button>
        </div>

        {error && (
          <div className='bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-md p-4'>
            <span>{error}</span>
            <Button variant='outline' size='sm' onClick={() => fetchDocuments()}>
              重试
            </Button>
          </div>
        )}

        <DocumentGrid
          documents={documents}
          loading={loading}
          onUpload={() => setUploadOpen(true)}
        />

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
