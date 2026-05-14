'use client'

import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@noter/ui/components/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { MindmapNode, DocumentMindmap } from '@/types/document'
import { useDocumentDetailStore } from '@/stores/documentDetail'

interface MindmapViewerProps {
  mindmap: DocumentMindmap | null
}

// Layout constants for tree positioning
const NODE_WIDTH = 180
const NODE_HEIGHT = 40
const HORIZONTAL_GAP = 60
const VERTICAL_GAP = 30

/**
 * Recursively converts a MindmapNode tree into React Flow nodes and edges.
 * Uses a simple left-to-right tree layout.
 */
function convertToFlowElements(root: MindmapNode): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // First pass: calculate subtree heights for layout
  function getSubtreeHeight(node: MindmapNode): number {
    if (!node.children || node.children.length === 0) {
      return NODE_HEIGHT
    }
    const childrenHeight = node.children.reduce(
      (sum, child) => sum + getSubtreeHeight(child) + VERTICAL_GAP,
      -VERTICAL_GAP
    )
    return Math.max(NODE_HEIGHT, childrenHeight)
  }

  // Second pass: position nodes
  function traverse(node: MindmapNode, depth: number, yOffset: number): void {
    const x = depth * (NODE_WIDTH + HORIZONTAL_GAP)
    const subtreeHeight = getSubtreeHeight(node)
    const y = yOffset + subtreeHeight / 2 - NODE_HEIGHT / 2

    nodes.push({
      id: node.id,
      position: { x, y },
      data: { label: node.label },
      style: {
        width: NODE_WIDTH,
        fontSize: depth === 0 ? 14 : 12,
        fontWeight: depth === 0 ? 600 : 400,
        borderRadius: 8,
        padding: '6px 12px'
      }
    })

    if (node.children && node.children.length > 0) {
      let currentY = yOffset
      for (const child of node.children) {
        const childHeight = getSubtreeHeight(child)
        edges.push({
          id: `${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          type: 'smoothstep'
        })
        traverse(child, depth + 1, currentY)
        currentY += childHeight + VERTICAL_GAP
      }
    }
  }

  traverse(root, 0, 0)
  return { nodes, edges }
}

export function MindmapViewer({ mindmap }: MindmapViewerProps) {
  const mindmapStatus = useDocumentDetailStore((s) => s.mindmapStatus)
  const regenerateMindmap = useDocumentDetailStore((s) => s.regenerateMindmap)

  const isRunning = mindmapStatus === 'running'

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!mindmap || !mindmap.mindmapJson) {
      return { initialNodes: [], initialEdges: [] }
    }
    const { nodes, edges } = convertToFlowElements(mindmap.mindmapJson)
    return { initialNodes: nodes, initialEdges: edges }
  }, [mindmap])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const handleRegenerate = useCallback(() => {
    regenerateMindmap()
  }, [regenerateMindmap])

  // Empty state: no mindmap data
  if (!mindmap || !mindmap.mindmapJson) {
    return (
      <div className='border-muted-foreground/30 bg-muted/10 flex h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed'>
        <p className='text-muted-foreground text-sm'>暂无思维导图</p>
        <Button
          variant='outline'
          size='sm'
          onClick={handleRegenerate}
          disabled={isRunning}
          aria-label='重新生成思维导图'>
          {isRunning ? (
            <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='mr-1.5 h-4 w-4' />
          )}
          {isRunning ? '生成中...' : '生成思维导图'}
        </Button>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <h3 className='text-muted-foreground text-sm font-medium'>思维导图</h3>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleRegenerate}
          disabled={isRunning}
          aria-label='重新生成思维导图'>
          {isRunning ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='h-4 w-4' />
          )}
          <span className='ml-1.5'>{isRunning ? '生成中...' : '重新生成'}</span>
        </Button>
      </div>
      <div className='bg-background h-[500px] w-full rounded-lg border'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
