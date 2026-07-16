'use client'

/**
 * MarkdownEditor — 公共文档在线 Markdown 编辑器
 *
 * 左侧 textarea 编辑,右侧 react-markdown 实时预览。
 * 保存按钮 + 变更说明输入框。
 * 调用 PUT /api/admin/public-documents/[id]/content。
 *
 * Requirements: 17
 */

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import httpClient from '@/lib/http/client'

interface MarkdownEditorProps {
  documentId: string
  initialContent: string
  onClose: () => void
  onSuccess: () => void
}

export default function MarkdownEditor({
  documentId,
  initialContent,
  onClose,
  onSuccess
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent)
  const [changeNote, setChangeNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasChanges = content !== initialContent

  const handleSave = async () => {
    if (!hasChanges) {
      setError('内容未发生变化')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await httpClient.put(`/api/admin/public-documents/${documentId}/content`, {
        markdownContent: content,
        changeNote: changeNote.trim() || undefined
      })

      if (res.data.data?.noChange) {
        setError('内容未发生变化')
        return
      }

      onSuccess()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '保存失败'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex flex-col bg-white'
      role='dialog'
      aria-modal='true'
      aria-labelledby='markdown-editor-title'>
      {/* 顶部工具栏 */}
      <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3'>
        <h2 id='markdown-editor-title' className='text-lg font-semibold text-gray-900'>
          在线编辑 Markdown
        </h2>
        <div className='flex items-center gap-3'>
          <input
            type='text'
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder='变更说明（可选）'
            className='w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
          />
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className='rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className='rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'>
            关闭
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className='border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600'>
          {error}
        </div>
      )}

      {/* 编辑区域:左右分栏 */}
      <div className='flex flex-1 overflow-hidden'>
        {/* 左侧:编辑器 */}
        <div className='flex flex-1 flex-col border-r border-gray-200'>
          <div className='border-b border-gray-100 bg-gray-50 px-4 py-2'>
            <span className='text-xs font-medium text-gray-500'>编辑</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className='flex-1 resize-none p-4 font-mono text-sm text-gray-800 focus:outline-none'
            placeholder='在此输入 Markdown 内容...'
            spellCheck={false}
          />
        </div>

        {/* 右侧:预览 */}
        <div className='flex flex-1 flex-col'>
          <div className='border-b border-gray-100 bg-gray-50 px-4 py-2'>
            <span className='text-xs font-medium text-gray-500'>预览</span>
          </div>
          <div className='flex-1 overflow-y-auto p-4'>
            <div className='prose prose-sm max-w-none'>
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
