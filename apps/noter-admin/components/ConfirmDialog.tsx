'use client'

/**
 * ConfirmDialog — 通用二次确认对话框
 *
 * 用于危险操作(封禁、软删、角色切换等)的二次确认。
 * 支持自定义标题、描述、确认/取消按钮文案与颜色。
 *
 * Requirements: 8, 9, 10, 11
 */

import { useCallback, useEffect, useRef } from 'react'

export interface ConfirmDialogProps {
  /** 是否显示 */
  open: boolean
  /** 标题 */
  title: string
  /** 描述文案 */
  description: string
  /** 确认按钮文案,默认 "确认" */
  confirmText?: string
  /** 取消按钮文案,默认 "取消" */
  cancelText?: string
  /** 确认按钮是否为危险样式(红色),默认 true */
  danger?: boolean
  /** 是否正在加载 */
  loading?: boolean
  /** 确认回调 */
  onConfirm: () => void
  /** 取消/关闭回调 */
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = true,
  loading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // ESC 关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel()
      }
    },
    [onCancel, loading]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={(e) => {
        if (e.target === overlayRef.current && !loading) onCancel()
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='confirm-dialog-title'
      aria-describedby='confirm-dialog-desc'>
      <div className='w-full max-w-md rounded-lg bg-white p-6 shadow-xl'>
        <h2 id='confirm-dialog-title' className='text-lg font-semibold text-gray-900'>
          {title}
        </h2>
        <p id='confirm-dialog-desc' className='mt-2 text-sm text-gray-600'>
          {description}
        </p>

        <div className='mt-6 flex justify-end gap-3'>
          <button
            type='button'
            className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
            onClick={onCancel}
            disabled={loading}>
            {cancelText}
          </button>
          <button
            type='button'
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={onConfirm}
            disabled={loading}>
            {loading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
