'use client'

import { useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { toFlowEdges, toFlowNodes } from '@/lib/graph/layout'
import type { NodeData } from '@/lib/graph/layout'
import { FilterBar } from './FilterBar'
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
import type { Node as DbNode, Edge as DbEdge } from '@/lib/db/schema'

const BASE_NODE_TYPES: NodeTypes = {
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

export function GraphView({ refreshKey = 0 }: GraphViewProps) {
  const [filter, setFilter] = useState('')
  const [viewState, setViewState] = useState<ViewState>({ status: 'loading' })
  const [resolvedNodeTypes, setResolvedNodeTypes] = useState<NodeTypes>(BASE_NODE_TYPES)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode<NodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])

  useEffect(() => {
    const url = filter ? `/api/graph?filter=${encodeURIComponent(filter)}` : '/api/graph'
    // refreshKey changes when a proposal is approved — forces a re-fetch
    void refreshKey
    let cancelled = false

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Graph fetch failed: ${r.status}`)
        return r.json() as Promise<GraphData>
      })
      .then((data) => {
        if (cancelled) return
        const extra: NodeTypes = {}
        for (const n of data.nodes) {
          const key = n.type.toLowerCase()
          if (!BASE_NODE_TYPES[key]) extra[key] = GenericNode
        }
        setResolvedNodeTypes({ ...BASE_NODE_TYPES, ...extra })
        setNodes(toFlowNodes(data.nodes))
        setEdges(toFlowEdges(data.edges))
        setViewState({ status: 'ready', data })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setViewState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      })

    return () => {
      cancelled = true
    }
  }, [filter, refreshKey, setNodes, setEdges])

  const isEmpty =
    viewState.status === 'ready' && viewState.data.nodes.length === 0

  return (
    <div className="flex flex-col h-full">
      <FilterBar active={filter} onChange={setFilter} />
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
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={resolvedNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  )
}
