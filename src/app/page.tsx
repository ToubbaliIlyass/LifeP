'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import {
  House, Share2, Activity, CheckSquare, Calendar, BookOpen,
  FileText, Search, Download, Upload, ChevronLeft,
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

// Placeholder logo mark — two lines converging into a node (the "A + node" concept)
function ActureMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2.5 17.5 L10 6.5 L17.5 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="5.5" y1="13.5" x2="14.5" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="2" fill="currentColor" />
    </svg>
  )
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('today')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(420)
  const [queueOpen, setQueueOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // ── Resize logic ──────────────────────────────────────
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  function startChatResize(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = chatWidth
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return
      const delta = ev.clientX - dragStartX.current
      setChatWidth(Math.max(260, Math.min(680, dragStartWidth.current + delta)))
    }
    function onUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Proposals polling ─────────────────────────────────
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

  // ── Keyboard shortcuts ────────────────────────────────
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

  // ── Import ────────────────────────────────────────────
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

      {/* ── Sidebar ────────────────────────────────────── */}
      <aside className={`
        hidden md:flex flex-col border-r border-border/60 shrink-0 py-5
        transition-[width] duration-200 overflow-hidden
        ${sidebarCollapsed ? 'w-[52px]' : 'w-[200px]'}
      `}>
        {/* Logo */}
        <div className={`mb-7 flex items-center gap-2.5 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4'}`}>
          <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
            <ActureMark className="w-[17px] h-[17px] text-foreground" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-[21px] font-bold tracking-tight text-foreground font-serif whitespace-nowrap">
              Acture
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex flex-col gap-0.5 flex-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={sidebarCollapsed ? t.label : undefined}
              className={`
                flex items-center rounded-lg text-[13px] font-medium transition-colors
                ${sidebarCollapsed ? 'justify-center p-2.5 w-full' : 'gap-3 px-3 py-2 w-full text-left'}
                ${tab === t.id
                  ? 'bg-muted/80 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }
              `}
            >
              <t.Icon className={`shrink-0 ${tab === t.id ? 'opacity-100' : 'opacity-55'} ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
              {!sidebarCollapsed && t.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className={`pt-3 border-t border-border/40 mt-3 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={() => setSearchOpen(true)}
            title={sidebarCollapsed ? 'Search' : undefined}
            className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'}`}
          >
            <Search className={`shrink-0 opacity-55 ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
            {!sidebarCollapsed && (
              <span className="flex items-center gap-1 flex-1">
                Search
                <kbd className="ml-auto text-[9px] text-muted-foreground/40 border border-border/50 rounded px-1 py-px font-mono">⌘K</kbd>
              </span>
            )}
          </button>
          <button
            onClick={() => window.open('/api/export', '_blank')}
            title={sidebarCollapsed ? 'Export' : undefined}
            className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'}`}
          >
            <Download className={`shrink-0 opacity-55 ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
            {!sidebarCollapsed && 'Export'}
          </button>
          <label className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full cursor-pointer ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'}`}>
            <Upload className={`shrink-0 opacity-55 ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
            {!sidebarCollapsed && 'Import'}
            <input type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>
          <div className={`${sidebarCollapsed ? 'flex justify-center py-1' : 'px-3 py-1'}`}>
            <ThemeToggle />
          </div>
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'}`}
          >
            <ChevronLeft className={`w-[15px] h-[15px] shrink-0 opacity-55 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            {!sidebarCollapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* ── Chat panel (resizable) ──────────────────────── */}
      <div
        className="flex flex-col shrink-0 relative border-r border-border/60"
        style={{ width: `min(${chatWidth}px, 100%)` }}
      >
        <ChatPanel inputRef={chatInputRef} />

        {/* Drag handle — sits on the right border */}
        <div
          onMouseDown={startChatResize}
          className="hidden md:block absolute inset-y-0 right-[-3px] w-[6px] z-20 cursor-ew-resize group"
        >
          {/* Visible indicator on hover */}
          <div className="absolute inset-y-0 left-[2px] w-[2px] rounded-full opacity-0 group-hover:opacity-100 bg-primary/40 transition-opacity duration-150" />
        </div>
      </div>

      {/* ── Main panel ─────────────────────────────────── */}
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
