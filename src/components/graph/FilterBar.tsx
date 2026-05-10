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
    <div className="flex items-center gap-0.5 bg-background/80 dark:bg-[oklch(0.125_0.004_255/90%)] backdrop-blur-md border border-border/50 rounded-xl px-1.5 py-1.5 shadow-[0_2px_12px_oklch(0_0_0/0.15)]">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap ${
            active === f.value
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
