'use client'

import { useState } from 'react'
import { Button } from '@noter/ui/components/button'
import { Download, Loader2 } from 'lucide-react'

interface DownloadButtonProps {
  documentId: string
  title: string
}

export function DownloadButton({ documentId, title }: DownloadButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/documents/${documentId}/download-pdf`)
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        setError(errData?.message || `下载失败 (${response.status})`)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `${title}_${date}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载失败，请重试'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex flex-col items-end gap-1'>
      <Button
        variant='outline'
        size='sm'
        disabled={loading}
        onClick={handleDownload}
        aria-label='下载文档 PDF'>
        {loading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Download className='h-4 w-4' />}
        <span className='ml-1.5'>{loading ? '生成中...' : '下载'}</span>
      </Button>
      {error && <p className='text-destructive max-w-[200px] text-right text-xs'>{error}</p>}
    </div>
  )
}
