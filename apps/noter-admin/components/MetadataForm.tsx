'use client'

/**
 * MetadataForm — 公共文档元数据编辑表单
 *
 * 编辑 title / short_description / language / category / tags。
 * 调用 PATCH /api/admin/public-documents/[id]/metadata。
 *
 * Requirements: 16
 */

import { useState, useEffect } from 'react'
import httpClient from '@/lib/http/client'

interface CategoryOption {
  id: string
  name: string
}

interface TagOption {
  id: string
  name: string
}

interface MetadataFormProps {
  documentId: string
  initialData: {
    title: string
    shortDescription: string
    language: string
    categoryId: string
    tagIds: string[]
  }
  onClose: () => void
  onSuccess: () => void
}

export default function MetadataForm({
  documentId,
  initialData,
  onClose,
  onSuccess
}: MetadataFormProps) {
  const [title, setTitle] = useState(initialData.title)
  const [shortDescription, setShortDescription] = useState(initialData.shortDescription)
  const [language, setLanguage] = useState(initialData.language)
  const [categoryId, setCategoryId] = useState(initialData.categoryId)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialData.tagIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ─── 选项数据 ───
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [tags, setTags] = useState<TagOption[]>([])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [catRes, tagRes] = await Promise.all([
          httpClient.get('/api/admin/public-categories'),
          httpClient.get('/api/admin/public-tags')
        ])
        setCategories(catRes.data.data.items)
        setTags(tagRes.data.data.items)
      } catch {
        // 选项加载失败不阻塞
      }
    }
    loadOptions()
  }, [])

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('标题不能为空')
      return
    }

    setSaving(true)
    setError('')

    try {
      await httpClient.patch(`/api/admin/public-documents/${documentId}/metadata`, {
        title: title.trim(),
        shortDescription: shortDescription.trim() || null,
        language: language.trim() || null,
        publicCategoryId: categoryId || null,
        tagIds: selectedTagIds
      })
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
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='metadata-form-title'>
      <div className='w-full max-w-lg rounded-lg bg-white p-6 shadow-xl'>
        <h2 id='metadata-form-title' className='text-lg font-semibold text-gray-900'>
          编辑元数据
        </h2>

        <form onSubmit={handleSubmit} className='mt-4 space-y-4'>
          {/* 标题 */}
          <div>
            <label className='block text-sm font-medium text-gray-700'>标题 *</label>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
              placeholder='文档标题'
            />
          </div>

          {/* 简介 */}
          <div>
            <label className='block text-sm font-medium text-gray-700'>简介</label>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={3}
              className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
              placeholder='文档简介'
            />
          </div>

          {/* 语言 */}
          <div>
            <label className='block text-sm font-medium text-gray-700'>语言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'>
              <option value=''>未指定</option>
              <option value='zh'>中文</option>
              <option value='en'>英文</option>
              <option value='ja'>日文</option>
              <option value='ko'>韩文</option>
            </select>
          </div>

          {/* 分类 */}
          <div>
            <label className='block text-sm font-medium text-gray-700'>分类</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className='mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'>
              <option value=''>未分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* 标签(多选) */}
          <div>
            <label className='block text-sm font-medium text-gray-700'>标签</label>
            <div className='mt-2 flex flex-wrap gap-2'>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type='button'
                  onClick={() => handleTagToggle(tag.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <p className='text-xs text-gray-400'>暂无可用标签</p>}
            </div>
          </div>

          {/* 错误提示 */}
          {error && <p className='text-sm text-red-600'>{error}</p>}

          {/* 操作按钮 */}
          <div className='flex justify-end gap-3 pt-2'>
            <button
              type='button'
              className='rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
              onClick={onClose}
              disabled={saving}>
              取消
            </button>
            <button
              type='submit'
              className='rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
              disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
