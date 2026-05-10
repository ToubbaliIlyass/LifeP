'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { toFlowGraph, computeRadialLayout } from '@/lib/graph/layout'
import { FloatingEdge } from './FloatingEdge'

const EDGE_TYPES = { floating: FloatingEdge }
import { GoalNode } from './nodes/GoalNode'
import { HabitNode } from './nodes/HabitNode'
import { TaskNode } from './nodes/TaskNode'
import { EventNode } from './nodes/EventNode'
import { ConceptNode } from './nodes/ConceptNode'
import { CourseNode } from './nodes/CourseNode'
import { AssignmentNode } from './nodes/AssignmentNode'
import { ExamNode } from './nodes/ExamNode'
import { NoteNode } from './nodes/NoteNode'
import { GenericNode } from './nodes/GenericNode'
import { RootNode } from './nodes/RootNode'
import { CategoryNode } from './nodes/CategoryNode'
import type { Node as DbNode, Edge as DbEdge } from '@/lib/db/schema'

const BASE_NODE_TYPES: NodeTypes = {
  root: RootNode,
  category: CategoryNode,
  goal: GoalNode,
  habit: HabitNode,
  task: TaskNode,
  event: EventNode,
  concept: ConceptNode,
  course: CourseNode,
  assignment: AssignmentNode,
  exam: ExamNode,
  note: NoteNode,
  journalentry: NoteNode,
  habitlog: GenericNode,
  project: GenericNode,
}

interface GraphData {
  nodes: DbNode[]
  edges: DbEdge[]
}

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: GraphData }

interface GraphViewProps {
  refreshKey?: number
}

// Observe dark class changes so controls/minimap re-theme on toggle
function useDarkMode() {
  const [dark, setDark] = useState(false)
  const ref = useRef<MutationObserver | null>(null)
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'))
    update()
    ref.current = new MutationObserver(update)
    ref.current.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => ref.current?.disconnect()
  }, [])
  return dark
}

export function GraphView({ refreshKey = 0 }: GraphViewProps) {
  const dark = useDarkMode()
  const [viewState, setViewState] = useState<ViewState>({ status: 'loading' })
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  function handleRelayout() {
    setNodes((current) => computeRadialLayout(current))
    setHoveredId(null)
  }

  useEffect(() => {
    let cancelled = false

    fetch('/api/graph')
      .then((r) => {
        if (!r.ok) throw new Error(`Graph fetch failed: ${r.status}`)
        return r.json() as Promise<GraphData>
      })
      .then((data) => {
        if (cancelled) return
        const { nodes: fn, edges: fe } = toFlowGraph(data.nodes, data.edges)
        setNodes(fn)
        setEdges(fe)
        setViewState({ status: 'ready', data })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setViewState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey, setNodes, setEdges])

  // Compute highlighted node ids for the current hover
  const highlightedIds = useMemo<Set<string>>(() => {
    if (!hoveredId) return new Set()

    const ids = new Set<string>([hoveredId])

    // Direct neighbors (1 level)
    for (const edge of edges) {
      if (edge.source === hoveredId) ids.add(edge.target)
      if (edge.target === hoveredId) ids.add(edge.source)
    }

    // For category nodes: also include their children's neighbors (2nd level)
    if (hoveredId.startsWith('__cat__:') || hoveredId === '__root__') {
      const firstLevel = new Set(ids)
      for (const edge of edges) {
        if (firstLevel.has(edge.source)) ids.add(edge.target)
        if (firstLevel.has(edge.target)) ids.add(edge.source)
      }
    }

    return ids
  }, [hoveredId, edges])

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        style: {
          ...n.style,
          opacity: hoveredId === null || highlightedIds.has(n.id) ? 1 : 0.1,
          transition: hoveredId === null
            ? 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
            : 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      })),
    [nodes, hoveredId, highlightedIds],
  )

  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const highlighted =
          hoveredId === null ||
          (highlightedIds.has(e.source) && highlightedIds.has(e.target))
        return {
          ...e,
          style: {
            ...e.style,
            opacity: highlighted ? 1 : 0.05,
            transition: hoveredId === null
              ? 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }
      }),
    [edges, hoveredId, highlightedIds],
  )

  const isEmpty = viewState.status === 'ready' && viewState.data.nodes.length === 0

  // Build node types: BASE_NODE_TYPES + GenericNode fallback for any unknown types
  const nodeTypes = useMemo<NodeTypes>(() => {
    const extra: NodeTypes = {}
    for (const n of nodes) {
      if (n.type && !BASE_NODE_TYPES[n.type]) extra[n.type] = GenericNode
    }
    return { ...BASE_NODE_TYPES, ...extra }
  }, [nodes])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        {viewState.status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50">
            <span className="text-sm text-muted-foreground">Loading graph…</span>
          </div>
        )}
        {viewState.status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-sm text-destructive">{viewState.message}</span>
          </div>
        )}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              No nodes yet — say something to your AI to get started
            </p>
          </div>
        )}
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={EDGE_TYPES}
          onNodeMouseEnter={(_, n) => setHoveredId(n.id)}
          onNodeMouseLeave={() => setHoveredId(null)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Panel position="top-right">
            <button
              onClick={handleRelayout}
              title="Arrange in radial layers"
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-card border border-border/60 text-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors shadow-sm backdrop-blur-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="2" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="22" />
                <line x1="2" y1="12" x2="4" y2="12" />
                <line x1="20" y1="12" x2="22" y2="12" />
              </svg>
              Re-layout
            </button>
          </Panel>
          <Background
            color={dark ? 'oklch(1 0 0 / 5%)' : 'oklch(0 0 0 / 8%)'}
            gap={24}
            size={1}
          />
          <Controls
            style={{
              background: dark ? 'oklch(0.125 0.004 255)' : 'oklch(1 0 0)',
              border: `1px solid ${dark ? 'oklch(1 0 0 / 10%)' : 'oklch(0 0 0 / 10%)'}`,
              borderRadius: '0.5rem',
              overflow: 'hidden',
              boxShadow: '0 2px 8px oklch(0 0 0 / 0.2)',
            }}
          />
          <MiniMap
            style={{
              background: dark ? 'oklch(0.125 0.004 255)' : 'oklch(1 0 0)',
              border: `1px solid ${dark ? 'oklch(1 0 0 / 10%)' : 'oklch(0 0 0 / 10%)'}`,
              borderRadius: '0.5rem',
            }}
            maskColor={dark ? 'oklch(0.095 0.004 255 / 75%)' : 'oklch(0.975 0.003 75 / 75%)'}
            nodeColor={dark ? 'oklch(0.22 0.004 255)' : 'oklch(0.85 0 0)'}
            nodeStrokeWidth={0}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
