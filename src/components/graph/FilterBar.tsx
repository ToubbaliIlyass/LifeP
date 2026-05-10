'use client'

import { useEffect, useState } from 'react'
import type { NodeType } from '@/lib/db/schema'

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

  const pinned = PINNED.filter((name) => nodeTypes.some((t) => t.name === name))
  const userCreated = nodeTypes
    .filter((t) => !t.isBuiltin && !PINNED.includes(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const hasConcept = nodeTypes.some((t) => t.name === 'Concept')

  const filters = [
    { label: 'All', value: '' },
    ...pinned.map((name) => ({ label: name + 's', value: `type:${name}` })),
    ...userCreated.map((t) => ({ label: t.name, value: `type:${t.name}` })),
    ...(hasConcept ? [{ label: 'Concepts', value: 'type:Concept' }] : []),
  ]

  return (
    <div className="flex items-end gap-0 px-4 border-b border-border/60 shrink-0 overflow-x-auto">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`relative px-3 py-2.5 text-[11px] font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 ${
            active === f.value
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground/70'
          }`}
        >
          {f.label}
          {active === f.value && (
            <span className="absolute bottom-0 left-3 right-3 h-px bg-primary rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}
