'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  House, Share2, Activity, CheckSquare, Calendar, BookOpen,
  FileText, Search, Inbox, PanelLeft, PanelLeftClose, ClipboardList, CalendarRange,
  Menu, X, MessageSquare, Settings as SettingsIcon, Target, PanelRightOpen, Clapperboard,
  NotebookPen, HeartPulse, ChevronDown,
} from 'lucide-react'
import { ContentPanel } from '@/components/content/ContentPanel'
import { JournalPanel } from '@/components/journal/JournalPanel'
import { HealthPanel } from '@/components/health/HealthPanel'
import { hiddenTabs as hiddenTabsForModules } from '@/lib/modules'
import { HabitsPanel } from '@/components/habits/HabitsPanel'
import { TasksPanel } from '@/components/tasks/TasksPanel'
import { EventsPanel } from '@/components/events/EventsPanel'
import { SchoolPanel } from '@/components/school/SchoolPanel'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { TodayView } from '@/components/today/TodayView'
import { GoalsPanel } from '@/components/goals/GoalsPanel'
import { ProposalQueue } from '@/components/proposals/ProposalQueue'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { SearchBar } from '@/components/search/SearchBar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SplashScreen } from '@/components/SplashScreen'
import { AppLoading } from '@/components/AppLoading'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { startListening } from '@/components/today/TodayAssistant'
import { AssistantProvider } from '@/components/chat/AssistantProvider'
import { ActureMark } from '@/components/ui/acture-mark'
import { SettingsPanel, type Settings } from '@/components/settings/SettingsPanel'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { useDataChanged } from '@/lib/dataSignal'
import { safeGet, safeSet } from '@/lib/storage'
import { applyTheme, applyMode, storedMode, storedTheme } from '@/lib/themes'

// Both pull in heavy libraries (@xyflow/react, the `ai` SDK) that mobile's
// first paint shouldn't have to pay for — split into their own chunks,
// loaded only once their tab/panel is actually reached.
const GraphView = dynamic(() => import('@/components/graph/GraphView').then((m) => m.GraphView), { ssr: false })
const ChatPanel = dynamic(() => import('@/components/chat/ChatPanel').then((m) => m.ChatPanel), { ssr: false })
// FullCalendar measures the DOM and reads the viewport on first render.
const CalendarView = dynamic(() => import('@/components/calendar/CalendarView').then((m) => m.CalendarView), { ssr: false })

type Tab = 'today' | 'goals' | 'calendar' | 'graph' | 'habits' | 'tasks' | 'events' | 'school' | 'notes' | 'journal' | 'health' | 'content' | 'activity' | 'proposals' | 'settings'



const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'today',     label: 'Today',     Icon: House },
  { id: 'goals',     label: 'Goals',     Icon: Target },
  { id: 'calendar',  label: 'Calendar',  Icon: CalendarRange },
  { id: 'graph',     label: 'Graph',     Icon: Share2 },
  { id: 'habits',    label: 'Habits',    Icon: Activity },
  { id: 'tasks',     label: 'Tasks',     Icon: CheckSquare },
  { id: 'events',    label: 'Events',    Icon: Calendar },
  { id: 'school',    label: 'School',    Icon: BookOpen },
  { id: 'notes',     label: 'Notes',     Icon: FileText },
  { id: 'journal',   label: 'Journal',   Icon: NotebookPen },
  { id: 'health',    label: 'Health',    Icon: HeartPulse },
  { id: 'content',   label: 'Content',   Icon: Clapperboard },
  { id: 'activity',  label: 'Activity',  Icon: ClipboardList },
  { id: 'proposals', label: 'Proposals', Icon: Inbox },
]

// Lives in the sidebar's bottom section rather than TABS: it is an app-level
// action, and it must never be hideable — it is the only way to unhide
// anything else.
const SETTINGS_TAB = { id: 'settings' as const, label: 'Settings', Icon: SettingsIcon }

/*
 * Simple mode is the app as it is meant to be used: capture with the AI, and
 * see what is planned. Acture is action-based — something stays only if it
 * is an action or tied to one.
 *
 *   core        Today (capture + the plan) and Calendar (the plan, wider)
 *   under More  what actions come from or are made of: goals, tasks,
 *               habits, school, content, proposals
 *   gone        what is not an action at all: the graph view, health,
 *               journal, notes, activity review, and an events list that
 *               only repeats the calendar
 *
 * Nothing is deleted; turning simple mode off in Settings brings every
 * panel back.
 */
const CORE_TABS: ReadonlySet<Tab> = new Set(['today', 'calendar'])
const NOT_ACTIONABLE: ReadonlySet<Tab> = new Set(['graph', 'health', 'journal', 'notes', 'activity', 'events'])

// Backgrounded tabs (mobile Safari/Chrome switched away, laptop lid closed)
// don't need to keep polling — pause while hidden and catch up the moment
// the tab becomes visible again. Shared by the proposals and reminders
// pollers below.
function useVisiblePolling(callback: () => void, intervalMs: number) {
  useEffect(() => {
    callback()
    let id: ReturnType<typeof setInterval> | null = null
    function startPolling() {
      if (id) return
      id = setInterval(callback, intervalMs)
    }
    function stopPolling() {
      if (id) { clearInterval(id); id = null }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') { callback(); startPolling() }
      else stopPolling()
    }
    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [callback, intervalMs])
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('today')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatWidth, setChatWidth] = useState(420)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [reminderCount, setReminderCount] = useState(0)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)
  const [viewingNodeId, setViewingNodeId] = useState<number | null>(null)
  // Bumped by quick-add (which bypasses the AI/proposal flow entirely) so
  // an already-open Today/Tasks/Notes tab picks up the new item immediately.
  const [dataRefreshKey, setDataRefreshKey] = useState(0)
  const [showSplash, setShowSplash] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Below md there's only room for one panel at a time — this picks
  // between the active tab's content and the chat panel (which is
  // otherwise shown side-by-side with it).
  const [mobileShowChat, setMobileShowChat] = useState(false)
  // md+ only: the chat folds away to give the content the whole width, the
  // way it already stays out of the way on phones. Remembered per device —
  // a laptop and a big monitor can reasonably want different answers.
  const [chatCollapsed, setChatCollapsed] = useState(false)
  useEffect(() => {
    // Read after mount, not in a lazy initialiser: the server render has no
    // storage, and a first client render that disagreed would not hydrate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (safeGet('local', 'acture-chat-collapsed') === '1') setChatCollapsed(true)
  }, [])
  function toggleChatCollapsed(next: boolean) {
    setChatCollapsed(next)
    safeSet('local', 'acture-chat-collapsed', next ? '1' : '0')
  }
  // The Calendar tab's Week view needs the extra width chat would take, so it's hidden while active.
  const [calendarViewMode, setCalendarViewMode] = useState<'day' | 'week'>('day')
  // Settings live in the database rather than this device, so hidden panels
  // and startup preferences follow the user between laptop and phone.
  const [settings, setSettings] = useState<Settings | null>(null)
  /* Whether the answer has come back at all — including "it failed", which
     must still let the app through rather than holding the loader forever. */
  const [settingsReady, setSettingsReady] = useState(false)
  const settingsAppliedRef = useRef(false)
  /* Setup opens by itself once. After Skip or Finish it stays shut for the
     rest of the session even if the server never heard about it — only
     "Run setup again" in Settings brings it back. */
  const [setupClosed, setSetupClosed] = useState(false)
  /** Simple mode's "More" in the sidebar. Per session: it starts folded. */
  const [moreOpen, setMoreOpen] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  function selectTab(t: Tab) {
    setTab(t)
    setMobileNavOpen(false)
    setMobileShowChat(false)
  }

  // Both go through safeGet/safeSet: on a phone with cookies blocked, a
  // bare sessionStorage access throws and takes the whole render down —
  // and dismissing the splash must never depend on the write succeeding,
  // or the intro screen covers the app forever.
  const handleSplashDone = useCallback(() => {
    setShowSplash(false)
    safeSet('session', 'acture-intro-seen', '1')
  }, [])

  useEffect(() => {
    if (safeGet('session', 'acture-intro-seen')) {
      setShowSplash(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settings: Settings } | null) => {
        if (!d) return
        setSettings(d.settings)
        // Palette and mode are already on the page from the pre-paint script;
        // this only corrects them when the database disagrees, which happens
        // the first time a device loads a choice made somewhere else.
        if (d.settings.theme && d.settings.theme !== storedTheme()) {
          applyTheme(d.settings.theme)
        }
        if (d.settings.mode && d.settings.mode !== storedMode()) {
          applyMode(d.settings.mode)
        }
        // Startup preferences apply on first load only — re-applying them on
        // every settings save would yank the user out of the tab they are in.
        if (!settingsAppliedRef.current) {
          settingsAppliedRef.current = true
          const wanted = d.settings.defaultTab
          const isHidden =
            (d.settings.hiddenTabs ?? []).includes(wanted) || hiddenTabsForModules(d.settings).has(wanted)
          if (wanted && wanted !== 'today' && !isHidden) {
            setTab(wanted as Tab)
          }
          setCalendarViewMode(d.settings.defaultCalendarView)
        }
      })
      .catch(() => {})
      .finally(() => setSettingsReady(true))
  }, [])

  /*
   * The recurring graph tidy-up.
   *
   * Nothing schedules it — there is no cron behind a single-user Next app —
   * so the app asks once per load and the endpoint decides whether the
   * interval has elapsed. Fired and forgotten: the sweep runs after its own
   * response, and nothing on screen is waiting for the answer.
   */
  // Only in the full app: in simple mode there is no graph to tidy for, and
  // an AI job on every load that nothing on screen uses is cost, not help.
  const sweptRef = useRef(false)
  useEffect(() => {
    if (!settings || settings.simple !== false || sweptRef.current) return
    sweptRef.current = true
    fetch('/api/graph/sweep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {})
  }, [settings])

  /*
   * Canvas, on the same terms: asked on every load, and the endpoint decides
   * whether enough time has passed. This is what makes the integration feel
   * automatic — an assignment posted this morning is simply there, rather
   * than waiting for someone to remember to press Sync in Settings.
   */
  useEffect(() => {
    fetch('/api/canvas/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto: true }),
    }).catch(() => {})
  }, [])

  // ── Resize (chat is now on the right — drag handle on left edge) ──
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
      const sidebarW = sidebarCollapsed ? 52 : 200
      // Leave at least 240px for the main panel — matches the CSS clamp on
      // the chat panel's width so dragging can't exceed what will render.
      const maxAllowed = Math.max(260, window.innerWidth - sidebarW - 240)
      setChatWidth(Math.max(260, Math.min(Math.min(680, maxAllowed), dragStartWidth.current - delta)))
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
  useVisiblePolling(refreshCount, 4000)

  // ── In-app reminders polling (overdue/due-today tasks, not-yet-done
  // habits) — no push infra, just "what needs attention" surfaced as a
  // badge on the Today tab. ──
  const refreshReminders = useCallback(() => {
    fetch('/api/reminders')
      .then((r) => r.json())
      .then(({ count }: { count: number }) => setReminderCount(count))
      .catch(() => {})
  }, [])
  useVisiblePolling(refreshReminders, 20_000)
  // Completing or deleting something changes this count immediately. Waiting
  // for the next poll left the badge showing a number the user had just
  // cleared, which reads as stuck rather than merely late.
  useDataChanged(refreshReminders)
  // Panels that load once redraw when the day changes elsewhere — a capture,
  // a tick, the chat. This used to be bumped only by the old quick-add sheet.
  const bumpData = useCallback(() => setDataRefreshKey((k) => k + 1), [])
  useDataChanged(bumpData)

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); window.open('/api/export', '_blank'); return }
      if (inInput) return
      if (e.key === '/') { e.preventDefault(); chatInputRef.current?.focus() }
      if (e.key === 'p') setTab('proposals')
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

  const hiddenTabs = new Set(settings?.hiddenTabs ?? [])
  // A switched-off module's tab does not exist — the registry says which, so
  // adding a module never means editing this file (src/lib/modules.ts).
  const offTabs = hiddenTabsForModules(settings)
  const moduleTabs = TABS.filter((t) => !offTabs.has(t.id))
  const visibleTabs = moduleTabs.filter((t) => t.id === 'settings' || !hiddenTabs.has(t.id))
  const activeTab = tab === 'settings' ? SETTINGS_TAB : TABS.find((t) => t.id === tab)

  // Simple mode shows the core three, plus Proposals only while something is
  // waiting in it, plus whichever tab is open so it never vanishes from
  // under you. Everything else is one click away under "More".
  const simple = settings?.simple !== false
  const isCore = (t: Tab) => CORE_TABS.has(t) || t === tab || (t === 'proposals' && pendingCount > 0)
  // A non-actionable tab still shows while it is the one open (a saved
  // default tab, say), so it never vanishes from under the reader.
  const inSimpleNav = (t: Tab) => !NOT_ACTIONABLE.has(t) || t === tab
  const extraTabs = simple ? visibleTabs.filter((t) => !isCore(t.id) && inSimpleNav(t.id)) : []
  const navTabs = !simple
    ? visibleTabs
    : visibleTabs.filter((t) => isCore(t.id) || (moreOpen && inSimpleNav(t.id)))
  const moreToggle = (collapsed: boolean) => extraTabs.length > 0 && (
    <button
      onClick={() => setMoreOpen((v) => !v)}
      title={collapsed ? (moreOpen ? 'Less' : 'More') : undefined}
      className={`flex items-center rounded-lg text-[12px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors w-full mt-1 ${
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-1.5 text-left'
      }`}
    >
      <ChevronDown className={`shrink-0 w-[15px] h-[15px] opacity-55 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
      {!collapsed && (moreOpen ? 'Less' : `More · ${extraTabs.length}`)}
    </button>
  )

  return (
    <UndoProvider>
    {/* One conversation, whether spoken to on Today or in the side panel. */}
    <AssistantProvider>
    <main
      // `fixed inset-0` instead of `h-dvh`: dvh is a *computed value* that
      // some browsers don't correctly re-resolve on real page zoom (as
      // opposed to a window resize, which CDP-level testing can't
      // reproduce) — the symptom is exactly "content stops at one
      // screen's height, with extra blank scrollable space below it"
      // rather than the content actually growing. `fixed` + `inset-0` is
      // bound directly to the current viewport by the compositor, not a
      // unit calculation, so it can't go stale the same way.
      className="fixed inset-0 flex bg-background text-foreground overflow-hidden"
      style={{ '--sidebar-w': sidebarCollapsed ? '52px' : '200px' } as React.CSSProperties}
    >

      {/* ── Sidebar ────────────────────────────────────── */}
      <aside className={`
        hidden md:flex flex-col bg-sidebar border-r border-border/60 shrink-0
        transition-[width] duration-200 overflow-hidden
        ${sidebarCollapsed ? 'w-[52px]' : 'w-[200px]'}
      `}>
        {/* Logo + collapse toggle — same height as main panel header */}
        <div className={`h-[52px] shrink-0 border-b border-border/60 flex items-center ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4'}`}>
          {sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center group relative"
            >
              <ActureMark className="w-[17px] h-[17px] text-foreground absolute transition-opacity duration-150 group-hover:opacity-0" />
              <PanelLeft className="w-[15px] h-[15px] text-foreground absolute transition-opacity duration-150 opacity-0 group-hover:opacity-100" />
            </button>
          ) : (
            <>
              <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                <ActureMark className="w-[17px] h-[17px] text-foreground" />
              </div>
              <span className="text-[21px] font-bold tracking-tight text-foreground whitespace-nowrap ml-2.5 flex-1">
                Acture
              </span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse sidebar"
                className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/40"
              >
                <PanelLeftClose className="w-[15px] h-[15px]" />
              </button>
            </>
          )}
        </div>

        {/* Nav — scrollable so it never pushes the pinned bottom section
            (Search/Export/Import/Dark mode) off-screen on short viewports,
            in either the expanded or collapsed sidebar width. */}
        <nav className={`flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto pt-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {navTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              title={sidebarCollapsed ? t.label : undefined}
              className={`
                relative flex items-center rounded-lg text-[13px] font-medium transition-colors
                ${sidebarCollapsed ? 'justify-center p-2.5 w-full' : 'gap-3 px-3 py-2 w-full text-left'}
                ${tab === t.id
                  ? 'bg-muted/80 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }
              `}
            >
              <t.Icon className={`shrink-0 ${tab === t.id ? 'opacity-100' : 'opacity-55'} ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
              {!sidebarCollapsed && t.label}
              {!sidebarCollapsed && t.id === 'proposals' && pendingCount > 0 && (
                <span className="ml-auto text-[9px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {pendingCount}
                </span>
              )}
              {sidebarCollapsed && t.id === 'proposals' && pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
              {/* Reminders: overdue/due-today tasks + not-yet-done habits — surfaced on Today regardless of which tab is currently open */}
              {!sidebarCollapsed && t.id === 'today' && reminderCount > 0 && (
                <span
                  className="ml-auto text-[9px] font-semibold bg-amber-500/85 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
                  title={`${reminderCount} need attention`}
                >
                  {reminderCount}
                </span>
              )}
              {sidebarCollapsed && t.id === 'today' && reminderCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500/85" title={`${reminderCount} need attention`} />
              )}
            </button>
          ))}
          {moreToggle(sidebarCollapsed)}
        </nav>

        {/* Bottom — pinned below the scrollable nav, never scrolls itself */}
        <div className={`shrink-0 pt-3 pb-4 border-t border-border/40 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={() => setSearchOpen(true)}
            title={sidebarCollapsed ? 'Search' : undefined}
            className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'}`}
          >
            <Search className={`shrink-0 opacity-55 ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
            {!sidebarCollapsed && (
              <span className="flex items-center gap-1 flex-1">
                Search
                <kbd className="ml-auto text-[9px] text-muted-foreground/65 border border-border/50 rounded px-1 py-px font-mono">⌘K</kbd>
              </span>
            )}
          </button>
          <ThemeToggle sidebar collapsed={sidebarCollapsed} />
          <button
            onClick={() => selectTab('settings')}
            title={sidebarCollapsed ? 'Settings' : undefined}
            className={`
              relative flex items-center rounded-lg text-[13px] font-medium transition-colors w-full
              ${sidebarCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'}
              ${tab === 'settings'
                ? 'bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }
            `}
          >
            <SettingsIcon className={`shrink-0 ${tab === 'settings' ? 'opacity-100' : 'opacity-55'} ${sidebarCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
            {!sidebarCollapsed && 'Settings'}
          </button>
        </div>
      </aside>

      {/* ── Main panel ─────────────────────────────────── */}
      {/*
        Below md there's no sidebar and no room to show content + chat
        side by side, so this panel and the chat panel below act as two
        mutually-exclusive views toggled by `mobileShowChat` (via the
        hamburger drawer and the chat button in the header).
      */}
      <div className={`${mobileShowChat ? 'hidden' : 'flex'} md:flex flex-col flex-1 overflow-hidden relative min-w-[240px]`}>
        <header className="flex items-center gap-2 px-3 md:px-5 h-[52px] border-b border-border/60 shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden -ml-1 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="Open navigation"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          {/* Today carries its date as the heading of its own centred column,
              so the bar stays empty there rather than pinning it to the left. */}
          <p className="text-[15px] font-semibold text-foreground flex-1 truncate">
            {tab === 'today' ? '' : activeTab?.label}
          </p>
          <button
            onClick={() => setSearchOpen(true)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          {/* In simple mode the assistant is on Today itself — there is no
              separate chat to open or to bring back. */}
          {!simple && (
          <button
            onClick={() => setMobileShowChat(true)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="Open chat"
          >
            <MessageSquare className="w-[18px] h-[18px]" />
          </button>
          )}
          {!simple && chatCollapsed && (
            <button
              onClick={() => toggleChatCollapsed(false)}
              className="hidden md:flex p-2 -mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
              aria-label="Show chat"
              title="Show chat"
            >
              <PanelRightOpen className="w-[17px] h-[17px]" />
            </button>
          )}
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'today'     && <TodayView onNavigate={(t) => setTab(t as Tab)} refreshKey={dataRefreshKey} weather={settings?.weather} simple={simple} />}
          {tab === 'goals'     && <GoalsPanel refreshKey={dataRefreshKey} />}
          {tab === 'graph'     && <GraphView refreshKey={graphRefreshKey} />}
          {tab === 'habits'    && <HabitsPanel />}
          {tab === 'tasks'     && <TasksPanel refreshKey={dataRefreshKey} />}
          {tab === 'events'    && <EventsPanel />}
          {tab === 'school'    && <SchoolPanel refreshKey={dataRefreshKey} />}
          {tab === 'notes'     && <NotesPanel refreshKey={dataRefreshKey} />}
          {tab === 'journal'   && <JournalPanel refreshKey={dataRefreshKey} />}
          {tab === 'health'    && <HealthPanel refreshKey={dataRefreshKey} />}
          {tab === 'content'   && <ContentPanel refreshKey={dataRefreshKey} />}
          {tab === 'calendar'  && <CalendarView onViewModeChange={setCalendarViewMode} initialViewMode={settings?.defaultCalendarView} workingHours={settings?.workingHours} />}
          {tab === 'activity'  && <ActivityPanel />}
          {tab === 'settings'  && (
            <SettingsPanel
              allTabs={moduleTabs.map((t) => ({ id: t.id, label: t.label }))}
              onSettingsChanged={(next) => {
                setSettings(next)
                if (!next.onboarding?.completed) setSetupClosed(false)
              }}
              onImport={handleImport}
            />
          )}
          {tab === 'proposals' && (
            <ProposalQueue
              onCountChange={(n) => setPendingCount(n)}
              onApproved={() => setGraphRefreshKey((k) => k + 1)}
            />
          )}
        </div>
      </div>

      {/* ── Chat panel (right side, resizable) ─────────── */}
      {/*
        Below md this only shows once the user opens it via the header's
        chat button (mobileShowChat) — it shares the viewport with the
        main panel above instead of always being visible there.
        At md+ it reverts to always-on, at the draggable pixel width via
        --chat-w. On the Calendar tab's Day view, the chat instead stays
        hidden until lg so the calendar grid gets the full width on
        medium/small screens. In Week view it stays hidden at every
        breakpoint (the 7-column grid needs the room even on desktop) —
        mobileShowChat can still force it open manually either way.
      */}
      {!simple && (
      <div
        className={`${mobileShowChat ? 'flex' : 'hidden'} ${
          chatCollapsed ? '' : tab === 'calendar' ? (calendarViewMode === 'week' ? '' : 'lg:flex') : 'md:flex'
        } flex-col w-full md:w-[min(var(--chat-w),calc(100vw-var(--sidebar-w)-240px))] shrink-0 relative border-l-0 md:border-l border-border/60 overflow-hidden`}
        style={{ '--chat-w': `${chatWidth}px` } as React.CSSProperties}
      >
        {/* Drag handle — left edge of chat panel */}
        <div
          onMouseDown={startChatResize}
          className="hidden md:block absolute inset-y-0 left-[-3px] w-[6px] z-20 cursor-ew-resize group"
        >
          <div className="absolute inset-y-0 left-[2px] w-[2px] rounded-full opacity-0 group-hover:opacity-100 bg-primary/40 transition-opacity duration-150" />
        </div>

        {/* Mobile-only bar to get back to the content panel */}
        <div className="md:hidden flex items-center px-3 h-[52px] border-b border-border/60 shrink-0">
          <button
            onClick={() => setMobileShowChat(false)}
            className="-ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
            aria-label="Back to content"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
          <p className="text-[15px] font-semibold text-foreground ml-1.5">Chat</p>
        </div>

        <ChatPanel
          inputRef={chatInputRef}
          onMutated={() => {
            setGraphRefreshKey((k) => k + 1)
            // Don't wait for the 4s poll — a proposal the user just triggered
            // should show up in the sidebar the moment the turn ends.
            refreshCount()
          }}
          onNavigate={(t) => { setTab(t as Tab); setMobileShowChat(false) }}
          onCollapse={() => toggleChatCollapsed(true)}
        />
      </div>
      )}

      {/* ── Mobile nav drawer ─────────────────────────── */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-[240px] max-w-[80vw] h-full bg-sidebar border-r border-border/60 flex flex-col">
            <div className="h-[52px] shrink-0 border-b border-border/60 flex items-center px-4">
              <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                <ActureMark className="w-[17px] h-[17px] text-foreground" />
              </div>
              <span className="text-[21px] font-bold tracking-tight text-foreground whitespace-nowrap ml-2.5 flex-1">
                Acture
              </span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="text-muted-foreground/50 hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/40"
                aria-label="Close navigation"
              >
                <X className="w-[15px] h-[15px]" />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 flex-1 pt-3 px-3 overflow-y-auto">
              {navTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectTab(t.id)}
                  className={`
                    relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors w-full text-left
                    ${tab === t.id
                      ? 'bg-muted/80 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }
                  `}
                >
                  <t.Icon className={`shrink-0 w-[15px] h-[15px] ${tab === t.id ? 'opacity-100' : 'opacity-55'}`} />
                  {t.label}
                  {t.id === 'proposals' && pendingCount > 0 && (
                    <span className="ml-auto text-[9px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                      {pendingCount}
                    </span>
                  )}
                  {t.id === 'today' && reminderCount > 0 && (
                    <span className="ml-auto text-[9px] font-semibold bg-amber-500/85 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                      {reminderCount}
                    </span>
                  )}
                </button>
              ))}
              {moreToggle(false)}
            </nav>
            <div className="pt-3 pb-4 border-t border-border/40 mt-3 space-y-0.5 px-3">
              <button
                onClick={() => { setSearchOpen(true); setMobileNavOpen(false) }}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full text-left"
              >
                <Search className="shrink-0 opacity-55 w-[15px] h-[15px]" />
                Search
              </button>
              <ThemeToggle sidebar />
              <button
                onClick={() => selectTab('settings')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors w-full text-left ${
                  tab === 'settings'
                    ? 'bg-muted/80 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <SettingsIcon className={`shrink-0 w-[15px] h-[15px] ${tab === 'settings' ? 'opacity-100' : 'opacity-55'}`} />
                Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <SearchBar
          onClose={() => setSearchOpen(false)}
          onSelectResult={(id) => setViewingNodeId(id)}
        />
      )}

      {viewingNodeId !== null && (
        <NodeDetailPanel
          nodeId={viewingNodeId}
          onClose={() => setViewingNodeId(null)}
          onMutated={() => { setGraphRefreshKey((k) => k + 1); setViewingNodeId(null) }}
        />
      )}

      {/* On a phone, one thumb from anywhere to the capture box — the same
          box as on Today, not a second way of adding things. Hidden while
          the chat fills the screen: the chat is its own way in. */}
      {!mobileShowChat && (
        <button
          onClick={() => { selectTab('today'); startListening() }}
          aria-label="Add to my day"
          className="md:hidden fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center text-2xl leading-none"
        >
          +
        </button>
      )}

      {showSplash && <SplashScreen onDone={handleSplashDone} />}

      {/* On a reload the splash is already spent, so without this the
          dashboard shows for a frame before settings arrive and decide what
          should have been on screen. */}
      {!showSplash && !settingsReady && <AppLoading />}

      {/* The setup interview, shown once, over everything. Only after the
          splash: two full-screen overlays at once is one too many, and the
          first question should not be competing with an animation. */}
      {!showSplash && settings && !settings.onboarding?.completed && !setupClosed && (
        <Onboarding
          onDone={() => {
            setSetupClosed(true)
            // Re-read rather than patch: onboarding writes modules, hours and
            // day parts, and the sidebar is built from all three.
            fetch('/api/settings')
              .then((r) => (r.ok ? r.json() : null))
              .then(async (d: { settings: Settings } | null) => {
                if (!d) return
                // The write that closed setup was lost, so the next load would
                // open it again. Send it once more rather than ask twice.
                if (!d.settings.onboarding?.completed) {
                  const res = await fetch('/api/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ onboarding: { completed: true, completedAt: new Date().toISOString() } }),
                  })
                  if (res.ok) d = (await res.json()) as { settings: Settings }
                }
                setSettings(d.settings)
              })
              .catch(() => {})
          }}
        />
      )}
    </main>
    </AssistantProvider>
    </UndoProvider>
  )
}
