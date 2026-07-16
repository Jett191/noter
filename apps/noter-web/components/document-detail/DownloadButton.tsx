'use client'

import { Button } from '@noter/ui/components/button'
import { cn } from '@noter/ui/lib/utils'
import { Download } from 'lucide-react'

interface DownloadButtonProps {
  title: string
  iconOnly?: boolean
  className?: string
}

export function DownloadButton({ title, iconOnly = false, className }: DownloadButtonProps) {
  const handleDownload = () => {
    // 获取文档正文区域的 HTML
    const articleEl = document.querySelector('main article')
    if (!articleEl) return

    const content = articleEl.innerHTML

    // 收集当前页面的所有样式表
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    // 打开新窗口，只包含文档正文
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        ${styles}
        <style>
          body {
            padding: 40px;
            max-width: 100%;
            margin: 0 auto;
          }
          @page {
            margin: 15mm;
            size: A4;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <article>${content}</article>
      </body>
      </html>
    `)
    printWindow.document.close()

    // 等待样式加载完成后打印
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  if (iconOnly) {
    return (
      <Button
        variant='ghost'
        size='icon-sm'
        onClick={handleDownload}
        aria-label='下载文档 PDF'
        className={cn('rounded-full', className)}>
        <Download className='h-4 w-4' />
      </Button>
    )
  }

  return (
    <Button
      variant='outline'
      size='sm'
      onClick={handleDownload}
      aria-label='下载文档 PDF'
      className={className}>
      <Download className='h-4 w-4' />
      <span className='ml-1.5'>下载</span>
    </Button>
  )
}
