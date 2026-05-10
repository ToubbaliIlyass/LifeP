'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import {
  House, Share2, Activity, CheckSquare, Calendar, BookOpen,
  FileText, Search, Download, Upload,
} from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { GraphView } from '@/components/graph/GraphView'
import { HabitsPanel } from '@/components/habits/HabitsPanel'
import { TasksPanel } from '@/components/tasks/TasksPanel'
import { EventsPanel } from '@/components/events/EventsPanel'
import { SchoolPanel } from '@/components/school/SchoolPanel'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { TodayView } from '@/components/today/TodayView'
import { ProposalQueue } from '@/components/proposals/ProposalQueue'
import { SearchBar } from '@/components/search/SearchBar'
import { ThemeToggle } from '@/components/ThemeToggle'

type Tab = 'today' | 'graph' | 'habits' | 'tasks' | 'events' | 'school' | 'notes'

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'today',  label: 'Today',   Icon: House },
  { id: 'graph',  label: 'Graph',   Icon: Share2 },
  { id: 'habits', label: 'Habits',  Icon: Activity },
  { id: 'tasks',  label: 'Tasks',   Icon: CheckSquare },
  { id: 'events', label: 'Events',  Icon: Calendar },
  { id: 'school', label: 'School',  Icon: BookOpen },
  { id: 'notes',  label: 'Notes',   Icon: FileText },
]

export default function Home() {
  const [tab, setTab] = useState<Tab>('today')
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

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); window.open('/api/export', '_blank'); return }
      if (inInput) return
      if (e.key === '/') { e.preventDefault(); chatInputRef.current?.focus() }
      if (e.key === 'p') setQueueOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  const activeTab = TABS.find((t) => t.id === tab)

  return (
    <main className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-[200px] shrink-0 border-r border-border/60 py-5">
        {/* Wordmark */}
        <div className="px-5 mb-7">
          <span className="text-[22px] font-bold tracking-tight text-foreground font-serif">
            Acture
          </span>
        </div>

        {/* Primary nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left w-full ${
                tab === t.id
                  ? 'bg-foreground/8 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <t.Icon className={`w-[15px] h-[15px] shrink-0 ${tab === t.id ? 'opacity-100' : 'opacity-60'}`} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Bottom utilities */}
        <div className="px-3 pt-3 border-t border-border/40 mt-3 space-y-0.5">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full text-left"
          >
            <Search className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Search
            <kbd className="ml-auto text-[9px] text-muted-foreground/40 border border-border/50 rounded px-1 py-px font-mono">⌘K</kbd>
          </button>
          <button
            onClick={() => window.open('/api/export', '_blank')}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full text-left"
          >
            <Download className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Export
          </button>
          <label className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full text-left cursor-pointer">
            <Upload className="w-[15px] h-[15px] shrink-0 opacity-60" />
            Import
            <input type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>
          <div className="px-3 py-1.5">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Chat ── */}
      <div className="w-full md:w-[420px] border-r border-border/60 flex flex-col shrink-0">
        <ChatPanel inputRef={chatInputRef} />
      </div>

      {/* ── Main panel ── */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        {/* Slim top bar */}
        <header className="flex items-center justify-between px-5 h-[52px] border-b border-border/60 shrink-0">
          <p className="text-[15px] font-semibold text-foreground font-serif">
            {activeTab?.label}
          </p>
          <button
            onClick={() => setQueueOpen(true)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
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
        </header>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {tab === 'today'  && <TodayView onNavigate={(t) => setTab(t as Tab)} />}
          {tab === 'graph'  && <GraphView refreshKey={graphRefreshKey} />}
          {tab === 'habits' && <HabitsPanel />}
          {tab === 'tasks'  && <TasksPanel />}
          {tab === 'events' && <EventsPanel />}
          {tab === 'school' && <SchoolPanel />}
          {tab === 'notes'  && <NotesPanel />}
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
