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

function OutlineItem({ node, activeId, onSelect }: OutlineItemProps) {
  const handleClick = useCallback(() => {
    const element = document.getElementById(node.id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onSelect(node.id)
    }
  }, [node.id, onSelect])

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
