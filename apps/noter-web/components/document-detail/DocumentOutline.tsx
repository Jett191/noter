'use client'

import { useCallback, useState } from 'react'
import { cn } from '@noter/ui/lib/utils'
import type { OutlineNode } from '@/types/document'

interface DocumentOutlineProps {
  outline: OutlineNode[] | null
}

/**
 * 文档大纲组件
 * 展示 h1-h4 标题层级结构，支持点击平滑滚动到对应位置
 * 无标题时隐藏大纲区域
 */
export function DocumentOutline({ outline }: DocumentOutlineProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // 过滤出 h1-h4 层级的节点
  const filteredOutline = filterOutlineNodes(outline)

  // 无标题时隐藏大纲区域
  if (!filteredOutline || filteredOutline.length === 0) {
    return null
  }

  return (
    <div className='w-full'>
      <h3 className='text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase'>
        目录
      </h3>
      <nav aria-label='文档大纲' className='overflow-y-auto pr-1'>
        <ul className='space-y-1'>
          {filteredOutline.map((node) => (
            <OutlineItem key={node.id} node={node} activeId={activeId} onSelect={setActiveId} />
          ))}
        </ul>
      </nav>
    </div>
  )
}

interface OutlineItemProps {
  node: OutlineNode
  activeId: string | null
  onSelect: (id: string) => void
}

/**
 * 生成和 rehype-slug (github-slugger) 一致的 id
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff\-_]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function OutlineItem({ node, activeId, onSelect }: OutlineItemProps) {
  const handleClick = useCallback(() => {
    // 尝试用 rehype-slug 风格的 id 查找
    const slug = toSlug(node.title)
    let element = document.getElementById(slug)
    // 回退：用原始 node.id
    if (!element) {
      element = document.getElementById(node.id)
    }
    // 再回退：按标题文本查找
    if (!element) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const h of headings) {
        if (h.textContent?.trim() === node.title) {
          element = h as HTMLElement
          break
        }
      }
    }
    if (element) {
      const el = element
      // 滚动到元素位置，偏下显示（距顶部 120px）
      const top = el.getBoundingClientRect().top + window.scrollY - 120
      window.scrollTo({ top, behavior: 'smooth' })
      onSelect(node.id)

      // 高亮闪烁两次提示（用内联 style 实现，避免 CSS purge 问题）
      const originalBg = el.style.backgroundColor
      const originalTransition = el.style.transition
      const originalRadius = el.style.borderRadius
      el.style.transition = 'background-color 0.3s ease'
      el.style.borderRadius = '4px'

      const blink = (count: number) => {
        if (count <= 0) {
          el.style.backgroundColor = originalBg
          el.style.transition = originalTransition
          el.style.borderRadius = originalRadius
          return
        }
        el.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'
        setTimeout(() => {
          el.style.backgroundColor = 'transparent'
          setTimeout(() => blink(count - 1), 300)
        }, 300)
      }
      setTimeout(() => blink(2), 300)
    }
  }, [node.id, node.title, onSelect])

  // 根据层级计算缩进: h1=0, h2=4, h3=8, h4=12
  const indent = (node.level - 1) * 16

  // 子节点
  const filteredChildren = node.children

  return (
    <li>
      <button
        type='button'
        onClick={handleClick}
        className={cn(
          'w-full truncate rounded-md px-2 py-1.5 text-left text-sm leading-normal transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          activeId === node.id
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground'
        )}
        style={{ paddingLeft: `${indent + 8}px` }}
        title={node.title}>
        {node.title}
      </button>
      {filteredChildren.length > 0 && (
        <ul className='space-y-1'>
          {filteredChildren.map((child) => (
            <OutlineItem key={child.id} node={child} activeId={activeId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * 递归过滤大纲节点，保留所有层级（h1-h6）
 */
function filterOutlineNodes(nodes: OutlineNode[] | null): OutlineNode[] {
  if (!nodes) return []
  return nodes
}
