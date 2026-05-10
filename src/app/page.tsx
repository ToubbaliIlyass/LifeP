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
  { id: 'graph',  label: 'graph',  key: '1' },
  { id: 'habits', label: 'habits', key: '2' },
  { id: 'tasks',  label: 'tasks',  key: '3' },
  { id: 'events', label: 'events', key: '4' },
  { id: 'school', label: 'school', key: '5' },
  { id: 'notes',  label: 'notes',  key: '6' },
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        window.open('/api/export', '_blank')
        return
      }
      if (inInput) return
      const tabByKey = TABS.find((t) => t.key === e.key)
      if (tabByKey) { setTab(tabByKey.id); return }
      if (e.key === '/') { e.preventDefault(); chatInputRef.current?.focus() }
      if (e.key === 'p') setQueueOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleExport() { window.open('/api/export', '_blank') }

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
    } catch { alert('Import failed — invalid file format.') }
    e.target.value = ''
  }

  return (
    <main className="flex flex-col h-screen bg-background text-foreground">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 h-[52px] border-b border-border/60 shrink-0">
        {/* Logo */}
        <div className="flex items-baseline gap-2">
          <span
            className="text-xl font-medium italic leading-none tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            LifeP
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:block tracking-widest uppercase">
            your life graph
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline text-[9px] text-muted-foreground/50 border border-border/60 rounded px-1 py-px font-mono">⌘K</kbd>
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="text-[11px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors hidden sm:block"
            title="Export graph (⌘E)"
          >
            Export
          </button>

          {/* Import */}
          <label className="text-[11px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition-colors cursor-pointer hidden sm:block">
            Import
            <input type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>

          <div className="w-px h-4 bg-border/60 mx-1 hidden sm:block" />

          <ThemeToggle />

          {/* Proposals badge */}
          <button
            onClick={() => setQueueOpen(true)}
            className={`ml-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
              pendingCount > 0
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            {pendingCount > 0 ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {pendingCount} pending
              </span>
            ) : 'proposals'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div className="w-full md:w-[42%] border-r border-border/60 flex flex-col shrink-0">
          <ChatPanel inputRef={chatInputRef} />
        </div>

        {/* Right panel */}
        <div className="hidden md:flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-end gap-0 px-4 border-b border-border/60 shrink-0 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-3 text-[11px] font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground/80'
                }`}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
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
