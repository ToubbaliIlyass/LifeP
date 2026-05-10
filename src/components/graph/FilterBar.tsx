'use client'

import { useEffect, useState } from 'react'
import type { NodeType } from '@/lib/db/schema'

// Built-in types always appear first in this order
const PINNED = ['Goal', 'Habit', 'Task', 'Event']

interface FilterBarProps {
  active: string
  onChange: (filter: string) => void
}

export function FilterBar({ active, onChange }: FilterBarProps) {
  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([])

  useEffect(() => {
    fetch('/api/node-types')
      .then((r) => r.json())
      .then(({ nodeTypes: types }: { nodeTypes: NodeType[] }) => setNodeTypes(types))
      .catch(() => {})
  }, [])

  // Build ordered filter list: All → pinned built-ins → user-created types (alphabetical) → Concept
  const pinned = PINNED.filter((name) => nodeTypes.some((t) => t.name === name))
  const userCreated = nodeTypes
    .filter((t) => !t.isBuiltin && !PINNED.includes(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const hasConcept = nodeTypes.some((t) => t.name === 'Concept')

  const filters = [
    { label: 'All', value: '' },
    ...pinned.map((name) => ({ label: `${name}s`, value: `type:${name}` })),
    ...userCreated.map((t) => ({ label: t.name, value: `type:${t.name}` })),
    ...(hasConcept ? [{ label: 'Concepts', value: 'type:Concept' }] : []),
  ]

  return (
    <div className="flex gap-1.5 px-3 py-2 border-b overflow-x-auto shrink-0">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors whitespace-nowrap ${
            active === f.value
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
