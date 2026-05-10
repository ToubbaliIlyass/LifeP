'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { GraphView } from '@/components/graph/GraphView'
import { HabitsPanel } from '@/components/habits/HabitsPanel'
import { TasksPanel } from '@/components/tasks/TasksPanel'
import { EventsPanel } from '@/components/events/EventsPanel'
import { SchoolPanel } from '@/components/school/SchoolPanel'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { ProposalQueue } from '@/components/proposals/ProposalQueue'
import { SearchBar } from '@/components/search/SearchBar'
import { ThemeToggle } from '@/components/ThemeToggle'

type RightTab = 'graph' | 'habits' | 'tasks' | 'events' | 'school' | 'notes'

const TABS: { id: RightTab; label: string; key: string }[] = [
  { id: 'graph',  label: 'Graph',  key: '1' },
  { id: 'habits', label: 'Habits', key: '2' },
  { id: 'tasks',  label: 'Tasks',  key: '3' },
  { id: 'events', label: 'Events', key: '4' },
  { id: 'school', label: 'School', key: '5' },
  { id: 'notes',  label: 'Notes',  key: '6' },
]

export default function Home() {
  const [tab, setTab] = useState<RightTab>('graph')
  const [queueOpen, setQueueOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const refreshCount = useCallback(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then(({ proposals }: { proposals: unknown[] }) => setPendingCount(proposals.length))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(refreshCount, 4000)
    return () => clearInterval(id)
  }, [refreshCount])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      // Cmd/Ctrl+K → open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      // Cmd/Ctrl+E → export
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        window.open('/api/export', '_blank')
        return
      }

      if (inInput) return

      // 1-6 → switch tabs
      const tabByKey = TABS.find((t) => t.key === e.key)
      if (tabByKey) { setTab(tabByKey.id); return }

      // / → focus chat input
      if (e.key === '/') {
        e.preventDefault()
        chatInputRef.current?.focus()
      }

      // p → open proposals
      if (e.key === 'p') setQueueOpen(true)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleExport() {
    window.open('/api/export', '_blank')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const json = JSON.parse(text)
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      const data = await res.json() as { ok: boolean; importedNodes: number; importedEdges: number }
      if (data.ok) {
        setGraphRefreshKey((k) => k + 1)
        alert(`Imported ${data.importedNodes} nodes and ${data.importedEdges} edges.`)
      }
    } catch {
      alert('Import failed — invalid file format.')
    }
    e.target.value = ''
  }

  return (
    <main className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-4 h-12 border-b shrink-0 gap-2">
        <span className="text-sm font-semibold tracking-tight">LifeP</span>

        <div className="flex items-center gap-1.5 flex-1 justify-end">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline text-[9px] border rounded px-1">⌘K</kbd>
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors hidden sm:block"
            title="Export graph as JSON (⌘E)"
          >
            Export
          </button>

          {/* Import */}
          <label className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors cursor-pointer hidden sm:block">
            Import
            <input type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>

          {/* Dark mode */}
          <ThemeToggle />

          {/* Proposals */}
          <button
            onClick={() => setQueueOpen(true)}
            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
              pendingCount > 0
                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {pendingCount > 0 ? `${pendingCount} pending` : 'Proposals'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-full md:w-2/5 border-r flex flex-col shrink-0">
          <ChatPanel inputRef={chatInputRef} />
        </div>

        <div className="hidden md:flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-0.5 px-3 pt-2 border-b shrink-0 bg-background overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === 'graph'  && <GraphView refreshKey={graphRefreshKey} />}
            {tab === 'habits' && <HabitsPanel />}
            {tab === 'tasks'  && <TasksPanel />}
            {tab === 'events' && <EventsPanel />}
            {tab === 'school' && <SchoolPanel />}
            {tab === 'notes'  && <NotesPanel />}
          </div>
        </div>
      </div>

      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}

      {queueOpen && (
        <ProposalQueue
          onClose={() => setQueueOpen(false)}
          onCountChange={(n) => {
            setPendingCount(n)
            if (n === 0) setQueueOpen(false)
          }}
          onApproved={() => setGraphRefreshKey((k) => k + 1)}
        />
      )}
    </main>
  )
}
