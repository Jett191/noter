'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@noter/ui/components/input'
import { Spinner } from '@noter/ui/components/spinner'
import { Search, Sparkles, Type, Layers, FileText } from 'lucide-react'
import { searchApi } from '@/lib/axios/search'
import { buildMatchAnchor } from '@/utils/feature/search/scrollAndHighlight'
import type { SearchResult } from '@/types/document'

const MAX_QUERY_LENGTH = 200
const DEBOUNCE_MS = 300
const SNIPPET_MAX_LENGTH = 220

/** 剥掉 markdown 语法符号，保留可读文本 */
function stripMarkdown(text: string): string {
  return (
    text
      // 代码块
      .replace(/```[\s\S]*?```/g, ' ')
      // 行内代码
      .replace(/`([^`]*)`/g, '$1')
      // 图片 ![alt](url) -> alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 链接 [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // 标题 #..######
      .replace(/^#{1,6}\s+/gm, '')
      // 引用 >
      .replace(/^\s*>\s?/gm, '')
      // 无序/有序列表
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // 加粗 / 斜体
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)([^*_\n]+?)\1/g, '$2')
      // 删除线
      .replace(/~~(.*?)~~/g, '$1')
      // 水平分割线
      .replace(/^\s*[-*_]{3,}\s*$/gm, '')
      // 表格分隔符
      .replace(/\|/g, ' ')
      // HTML 标签（mark 已在外层单独处理，这里不会再遇到）
      .replace(/<\/?[^>]+>/g, '')
      // 折叠空白
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Segment {
  text: string
  highlight: boolean
}

/** 将 matchedContent 拆成 [纯文本片段 / 高亮片段] 序列。
 *  - 关键词命中：服务端 ts_headline 返回的 <mark>...</mark> 直接复用
 *  - 向量命中：用查询词做客户端兜底高亮
 */
function buildSegments(content: string, query: string): Segment[] {
  const segments: Segment[] = []
  const markRegex = /<mark>([\s\S]*?)<\/mark>/gi
  let lastIndex = 0
  let hasMark = false
  let m: RegExpExecArray | null

  while ((m = markRegex.exec(content)) !== null) {
    hasMark = true
    if (m.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, m.index), highlight: false })
    }
    segments.push({ text: m[1], highlight: true })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), highlight: false })
  }

  // 全部清洗 markdown
  const cleaned = segments
    .map((seg) => ({ ...seg, text: stripMarkdown(seg.text) }))
    .filter((seg) => seg.text.length > 0)

  if (hasMark) return cleaned

  // 向量结果走客户端高亮
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return cleaned

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const matchPattern = new RegExp(`^(?:${tokens.map(escapeRegExp).join('|')})$`, 'i')

  const out: Segment[] = []
  for (const seg of cleaned) {
    const parts = seg.text.split(pattern)
    for (const part of parts) {
      if (!part) continue
      out.push({ text: part, highlight: matchPattern.test(part) })
    }
  }
  return out
}

/** 按片段总长度做截断，避免超长片段把下拉撑开 */
function clampSegments(segments: Segment[], max: number): Segment[] {
  let remaining = max
  const out: Segment[] = []
  for (const seg of segments) {
    if (remaining <= 0) break
    if (seg.text.length <= remaining) {
      out.push(seg)
      remaining -= seg.text.length
    } else {
      out.push({ ...seg, text: seg.text.slice(0, remaining) + '…' })
      remaining = 0
    }
  }
  return out
}

function HighlightedSnippet({ content, query }: { content: string; query: string }) {
  const segments = useMemo(
    () => clampSegments(buildSegments(content, query), SNIPPET_MAX_LENGTH),
    [content, query]
  )
  if (segments.length === 0) return null
  return (
    <p className='text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-snug break-words whitespace-normal'>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            className='text-foreground rounded-sm bg-yellow-200/80 px-0.5 dark:bg-yellow-500/40'>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  )
}

const matchTypeMeta: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  keyword: {
    label: '关键词',
    icon: Type,
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
  },
  vector: {
    label: '语义',
    icon: Sparkles,
    className: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300'
  },
  hybrid: {
    label: '混合',
    icon: Layers,
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
  }
}

function MatchTypeChip({ matchType }: { matchType: string }) {
  const meta = matchTypeMeta[matchType]
  if (!meta) {
    return (
      <span className='text-muted-foreground bg-muted shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
        {matchType}
      </span>
    )
  }
  const Icon = meta.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}>
      <Icon className='size-3' />
      {meta.label}
    </span>
  )
}

export function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  // 用于在结果渲染时，保留触发该次搜索的查询词（避免输入框清空时高亮失效）
  const [activeQuery, setActiveQuery] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setLoading(true)
    setError(null)
    setActiveQuery(searchQuery)

    try {
      const data = await searchApi.search({ query: searchQuery })
      // 兜底按相关度降序排序，避免后端顺序异常时仍能正确呈现
      const sorted = [...(data ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      setResults(sorted)
      setShowDropdown(true)
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('timeout')
          ? '搜索请求超时，请重试'
          : '搜索失败，请重试'
      setError(message)
      setResults([])
      setShowDropdown(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, MAX_QUERY_LENGTH)
    setQuery(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!value.trim()) {
      setResults([])
      setShowDropdown(false)
      setError(null)
      return
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value)
    }, DEBOUNCE_MS)
  }

  const handleResultClick = (result: SearchResult) => {
    setShowDropdown(false)
    const params = new URLSearchParams()
    const anchor = buildMatchAnchor(result.matchedContent)
    if (anchor) params.set('match', anchor)
    if (activeQuery) params.set('q', activeQuery)
    const qs = params.toString()
    router.push(`/documents/${result.documentId}${qs ? `?${qs}` : ''}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const handleRetry = () => {
    if (query.trim()) {
      performSearch(query)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className='relative w-full max-w-md' onKeyDown={handleKeyDown}>
      <div className='relative'>
        <Search className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2' />
        <Input
          type='text'
          placeholder='搜索文档...'
          value={query}
          onChange={handleInputChange}
          maxLength={MAX_QUERY_LENGTH}
          className='pr-9 pl-9'
          onFocus={() => {
            if (results.length > 0 || error) {
              setShowDropdown(true)
            }
          }}
        />
        {loading && (
          <Spinner className='text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2' />
        )}
      </div>

      {showDropdown && (
        <div className='bg-popover border-border absolute top-full left-0 z-50 mt-2 w-full min-w-[20rem] overflow-hidden rounded-xl border shadow-lg'>
          {error ? (
            <div className='flex flex-col items-center gap-2 px-4 py-6 text-center'>
              <p className='text-destructive text-sm'>{error}</p>
              <button
                type='button'
                onClick={handleRetry}
                className='text-primary hover:text-primary/80 text-xs underline underline-offset-4'>
                重试
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className='text-muted-foreground px-4 py-6 text-center text-sm'>
              未找到相关文档
            </div>
          ) : (
            <>
              <div className='text-muted-foreground border-border/60 border-b px-3 py-1.5 text-[11px] font-medium tracking-wide uppercase'>
                搜索结果 · {results.length}
              </div>
              <ul className='max-h-96 overflow-y-auto overscroll-contain py-1'>
                {results.map((result, index) => (
                  <li key={`${result.documentId}-${index}`}>
                    <button
                      type='button'
                      className='hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors outline-none'
                      onClick={() => handleResultClick(result)}>
                      <FileText className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <span className='text-foreground truncate text-sm font-medium'>
                            {result.title}
                          </span>
                          <MatchTypeChip matchType={result.matchType} />
                        </div>
                        <HighlightedSnippet content={result.matchedContent} query={activeQuery} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
