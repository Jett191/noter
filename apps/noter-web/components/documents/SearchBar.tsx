'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@noter/ui/components/input'
import { Spinner } from '@noter/ui/components/spinner'
import { Badge } from '@noter/ui/components/badge'
import { Search } from 'lucide-react'
import { searchApi } from '@/lib/axios/search'
import type { SearchResult } from '@/types/document'

const MAX_QUERY_LENGTH = 200
const DEBOUNCE_MS = 300

export function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

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

    try {
      const data = await searchApi.search({ query: searchQuery })
      setResults(data ?? [])
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

  const handleResultClick = (documentId: string) => {
    setShowDropdown(false)
    router.push(`/documents/${documentId}`)
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

  const matchTypeLabel: Record<string, string> = {
    keyword: '关键词',
    vector: '语义',
    hybrid: '混合'
  }

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
        <div className='bg-popover border-border absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-md'>
          {error ? (
            <div className='flex flex-col items-center gap-2 p-4 text-center'>
              <p className='text-destructive text-sm'>{error}</p>
              <button
                type='button'
                onClick={handleRetry}
                className='text-primary hover:text-primary/80 text-sm underline underline-offset-4'>
                重试
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className='text-muted-foreground p-4 text-center text-sm'>未找到相关文档</div>
          ) : (
            <ul className='max-h-80 overflow-y-auto'>
              {results.map((result) => (
                <li key={result.documentId}>
                  <button
                    type='button'
                    className='hover:bg-accent w-full cursor-pointer px-4 py-3 text-left transition-colors'
                    onClick={() => handleResultClick(result.documentId)}>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-foreground truncate text-sm font-medium'>
                        {result.title}
                      </span>
                      <Badge variant='secondary' className='shrink-0'>
                        {matchTypeLabel[result.matchType] ?? result.matchType}
                      </Badge>
                    </div>
                    <div
                      className='text-muted-foreground [&>mark]:text-foreground mt-1 line-clamp-2 text-xs [&>mark]:bg-yellow-200 dark:[&>mark]:bg-yellow-800'
                      dangerouslySetInnerHTML={{ __html: result.matchedContent }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
