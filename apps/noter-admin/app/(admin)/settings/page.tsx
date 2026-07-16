'use client'

/**
 * 系统设置页
 *
 * 设计参见 design.md §8.1 (设置页):
 *   - 4 项 SettingItem:开关 + 描述
 *   - 修改时弹二次确认对话框,展示前后值
 *   - 调用 GET/PATCH /api/admin/system-settings
 *
 * Requirements: 24
 */

import { useState, useEffect, useCallback } from 'react'
import httpClient from '@/lib/http/client'
import ConfirmDialog from '@/components/ConfirmDialog'

// ─── 类型定义 ───

type SettingKey =
  | 'allow_user_upload'
  | 'allow_user_delete_own'
  | 'public_documents_visible'
  | 'audit_log_enabled'

interface SettingConfig {
  key: SettingKey
  title: string
  description: string
}

const SETTINGS_CONFIG: SettingConfig[] = [
  {
    key: 'allow_user_upload',
    title: '允许用户上传文档',
    description: '关闭后,普通用户将无法上传新文档。已有文档不受影响。'
  },
  {
    key: 'allow_user_delete_own',
    title: '允许用户删除自己的文档',
    description: '关闭后,普通用户将无法删除自己的文档,需联系管理员处理。'
  },
  {
    key: 'public_documents_visible',
    title: '公共文档对用户可见',
    description: '关闭后,普通用户将无法在 noter-web 中看到公共文档和 Noter 官方文件夹。'
  },
  {
    key: 'audit_log_enabled',
    title: '启用审计日志',
    description: '关闭后,管理操作将不再记录审计日志。注意:切换此开关本身始终会被记录。'
  }
]

export default function SettingsPage() {
  // ─── 设置状态 ───
  const [settings, setSettings] = useState<Record<SettingKey, boolean>>({
    allow_user_upload: true,
    allow_user_delete_own: true,
    public_documents_visible: true,
    audit_log_enabled: true
  })
  const [loading, setLoading] = useState(true)

  // ─── 确认对话框 ───
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingChange, setPendingChange] = useState<{
    key: SettingKey
    newValue: boolean
  } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── Toast ───
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── 数据获取 ───
  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpClient.get('/api/admin/system-settings')
      const data = res.data.data.settings as Record<SettingKey, boolean>
      setSettings(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取系统设置失败'
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ─── 切换处理 ───
  const handleToggle = (key: SettingKey) => {
    const newValue = !settings[key]
    setPendingChange({ key, newValue })
    setConfirmOpen(true)
  }

  const executeChange = async () => {
    if (!pendingChange) return
    setActionLoading(true)
    try {
      await httpClient.patch('/api/admin/system-settings', {
        key: pendingChange.key,
        value: pendingChange.newValue
      })
      setSettings((prev) => ({
        ...prev,
        [pendingChange.key]: pendingChange.newValue
      }))
      showToast('设置已更新')
      setConfirmOpen(false)
      setPendingChange(null)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        '更新设置失败'
      showToast(message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── 获取确认对话框描述 ───
  const getConfirmDescription = (): string => {
    if (!pendingChange) return ''
    const config = SETTINGS_CONFIG.find((s) => s.key === pendingChange.key)
    const currentValue = settings[pendingChange.key]
    const beforeLabel = currentValue ? '开启' : '关闭'
    const afterLabel = pendingChange.newValue ? '开启' : '关闭'
    return `确定要修改「${config?.title}」吗？\n\n当前值: ${beforeLabel}\n修改为: ${afterLabel}`
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-lg border border-gray-200 bg-white p-5'>
            <div className='flex items-center justify-between'>
              <div>
                <div className='h-5 w-40 rounded bg-gray-200' />
                <div className='mt-2 h-4 w-64 rounded bg-gray-200' />
              </div>
              <div className='h-6 w-11 rounded-full bg-gray-200' />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <p className='text-sm text-gray-500'>
        以下设置控制 noter-web 用户端的访问权限。修改后立即生效。
      </p>

      {SETTINGS_CONFIG.map((config) => (
        <SettingItem
          key={config.key}
          config={config}
          value={settings[config.key]}
          onToggle={() => handleToggle(config.key)}
        />
      ))}

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmOpen}
        title='修改系统设置'
        description={getConfirmDescription()}
        confirmText='确认修改'
        danger={false}
        loading={actionLoading}
        onConfirm={executeChange}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingChange(null)
        }}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 bottom-4 z-50 rounded-md px-4 py-3 text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── SettingItem 组件 ───

function SettingItem({
  config,
  value,
  onToggle
}: {
  config: SettingConfig
  value: boolean
  onToggle: () => void
}) {
  return (
    <div className='rounded-lg border border-gray-200 bg-white p-5'>
      <div className='flex items-center justify-between'>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold text-gray-900'>{config.title}</h3>
          <p className='mt-1 text-sm text-gray-500'>{config.description}</p>
        </div>
        <button
          type='button'
          role='switch'
          aria-checked={value}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none ${
            value ? 'bg-blue-600' : 'bg-gray-200'
          }`}>
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              value ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
