'use client'

import { useEffect, useCallback, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { ProposalQueue } from '@/components/proposals/ProposalQueue'
import { AppLoading } from '@/components/AppLoading'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { TodayAssistant, attachFiles, startListening, startTyping } from '@/components/today/TodayAssistant'
import { AssistantProvider } from '@/components/chat/AssistantProvider'
import { SettingsPanel, type Settings } from '@/components/settings/SettingsPanel'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { TodosProvider } from '@/components/todos/TodosProvider'
import { Sidebar } from '@/components/todos/Sidebar'
import { TodoView } from '@/components/todos/TodoView'
import { QuickFind } from '@/components/todos/QuickFind'
import { CheckIn } from '@/components/todos/CheckIn'
import { todayStr } from '@/lib/date'
import { notifyDataChanged } from '@/lib/dataSignal'
import { safeGet, safeSet } from '@/lib/storage'
import { applyTheme, applyMode, storedMode, storedTheme } from '@/lib/themes'
import { setClockZone } from '@/lib/wallclock'

/*
 * Acture is one loop: say what needs to happen, and it becomes to-dos with a
 * time on your day — placed by an assistant that learns when you actually do
 * things.
 *
 * Two layers, and the flow between them goes one way round:
 *
 *   action   lists of to-dos — Inbox, Today, Upcoming, Anytime, Someday,
 *            Logbook, and the user's own projects and areas — with the
 *            assistant under every one, to speak or type to
 *   memory   what doing those to-dos has taught: when things really happen,
 *            what drifts from the plan, what was said outright. Read by the
 *            planner and the assistant, never filed by hand — and never
 *            shown: it works in the background, by the user's choice.
 *
 * Acting feeds the memory; the memory shapes the next plan.
 */

// Backgrounded tabs (mobile Safari/Chrome switched away, laptop lid closed)
// don't need to keep polling — pause while hidden and catch up the moment
// the tab becomes visible again.
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
  const [view, setView] = useState('today')
  /** Quick Find, open, with what had been typed when it opened. */
  const [finding, setFinding] = useState<string | null>(null)
  /** Slim Mode: the sidebar put away, the list alone. */
  const [slim, setSlim] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Settings live in the database rather than this device, so preferences
  // follow the user between laptop and phone.
  const [settings, setSettings] = useState<Settings | null>(null)
  /* Whether the answer has come back at all — including "it failed", which
     must still let the app through rather than holding the loader forever. */
  const [settingsReady, setSettingsReady] = useState(false)
  /* Setup opens by itself once. After Skip or Finish it stays shut for the
     rest of the session even if the server never heard about it — only
     "Run setup again" in Settings brings it back. */
  const [setupClosed, setSetupClosed] = useState(false)
  /*
   * How wide the lists run: one calm column, or the whole window. Kept on
   * this device rather than in settings — the right answer for a laptop is
   * the wrong one for the monitor next to it.
   */
  const [stretched, setStretched] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so server and first client render agree
    if (safeGet('local', 'acture-list-width') === 'stretched') setStretched(true)
  }, [])
  const toggleStretched = useCallback(() => {
    setStretched((on) => {
      safeSet('local', 'acture-list-width', on ? 'compact' : 'stretched')
      return !on
    })
  }, [])

  /*
   * Every list has its own address (#today, #project:12), so the browser's
   * back goes to the list before, a reload stays put, and a list can be
   * opened in a second tab or window beside the first — Things' multiple
   * windows, the browser's way.
   */
  const select = useCallback((next: string) => {
    setView(next)
    setMobileNavOpen(false)
    if (typeof window !== 'undefined' && window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`)
  }, [])
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.slice(1))
      if (h) { setView(h); setMobileNavOpen(false) }
    }
    fromHash()
    window.addEventListener('popstate', fromHash)
    return () => window.removeEventListener('popstate', fromHash)
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so server and first client render agree
    if (safeGet('local', 'acture-slim') === '1') setSlim(true)
  }, [])
  const toggleSlim = useCallback(() => {
    setSlim((on) => {
      safeSet('local', 'acture-slim', on ? '0' : '1')
      return !on
    })
  }, [])

  /** Capture, from anywhere: a list with the assistant under it, listening. */
  const capture = useCallback(() => {
    setView((v) => (v === 'proposals' || v === 'settings' ? 'today' : v))
    startListening()
  }, [])

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settings: Settings } | null) => {
        if (!d) return
        // The clock the screen reads: a zone pinned in Settings wins over the
        // browser's own, which can be stale — see src/lib/wallclock.ts.
        setClockZone(d.settings.timeZoneOverride ?? null)
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
      })
      .catch(() => {})
      .finally(() => setSettingsReady(true))
  }, [])

  // ── Proposals polling ─────────────────────────────────
  const refreshCount = useCallback(() => {
    fetch('/api/proposals')
      .then((r) => r.json())
      .then(({ proposals }: { proposals: unknown[] }) => setPendingCount(proposals.length))
      .catch(() => {})
  }, [])
  useVisiblePolling(refreshCount, 4000)

  // ── Keyboard shortcuts ────────────────────────────────
  // The lists own their own keys (N, arrows, space — see TodoView); these
  // are the ones that work from every page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement
      const inInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setFinding(''); return }
      // Slim Mode, as in Things: ⌘/ puts the sidebar away and brings it back.
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); toggleSlim(); return }
      // Capture: Ctrl+C, from anywhere — unless something is selected, when
      // Ctrl+C has to stay "copy" (it is copy outright on Windows and Linux).
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'c') {
        if (inInput || (window.getSelection()?.toString() ?? '') !== '') return
        e.preventDefault()
        capture()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); window.open('/api/export', '_blank'); return }
      if (inInput || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); setFinding('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [capture, toggleSlim])

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
        notifyDataChanged()
        alert(`Imported ${data.importedNodes} nodes and ${data.importedEdges} edges.`)
      }
    } catch { alert('Import failed — invalid file format.') }
    e.target.value = ''
  }


  return (
    <UndoProvider>
    {/* One conversation, kept while moving between lists. */}
    <AssistantProvider>
    <TodosProvider>
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
    >
      <Sidebar
        slim={slim}
        onQuickFind={() => setFinding('')}
        onCapture={(how) => {
          setMobileNavOpen(false)
          setView((v) => (v === 'proposals' || v === 'settings' ? 'today' : v))
          if (how === 'type') startTyping()
          else startListening()
        }}
        onAttach={(files) => {
          setMobileNavOpen(false)
          setView((v) => (v === 'proposals' || v === 'settings' ? 'today' : v))
          attachFiles(files)
        }}
        view={view}
        onSelect={select}
        pendingCount={pendingCount}
        open={mobileNavOpen}
      />

      <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
        {slim && (
          <button onClick={toggleSlim} title="Show the sidebar (⌘/)" aria-label="Show the sidebar" className="max-md:hidden absolute z-20 top-3 left-3 grid place-items-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        {view === 'proposals' ? (
          <ProposalQueue onCountChange={setPendingCount} onOpenMenu={() => setMobileNavOpen(true)} />
        ) : view === 'settings' ? (
          // Drawn as one more list, with its own title in the list's column.
          <SettingsPanel
            onSettingsChanged={(next) => {
              setSettings(next)
              if (!next.onboarding?.completed) setSetupClosed(false)
            }}
            onImport={handleImport}
            onOpenMenu={() => setMobileNavOpen(true)}
            stretched={stretched}
            onToggleStretched={toggleStretched}
            slim={slim}
            onToggleSlim={toggleSlim}
          />
        ) : (
          <>
            {/* Keyed by list, so what was open, selected or filtered in one
                does not follow into the next. */}
            {/* The assistant goes in as the list's own footer, so it shares
                the list's column exactly: speak or type, and what it makes of
                it appears in the list above. */}
            <TodoView
              key={view}
              view={view}
              stretched={stretched}
              onNavigate={select}
              onOpenMenu={() => setMobileNavOpen(true)}
              onQuickFind={(initial) => setFinding(initial)}
              dock={<TodayAssistant dock onNavigate={select} />}
              banner={<CheckIn date={todayStr()} />}
            />
          </>
        )}
      </div>

      {finding !== null && <QuickFind initial={finding} onClose={() => setFinding(null)} onNavigate={select} />}

      {/* Until settings arrive the app does not know whether setup is still
          to come, so nothing is shown rather than the lists for a frame. */}
      {!settingsReady && <AppLoading />}

      {/* The setup interview, shown once, over everything. Only after the
          splash: two full-screen overlays at once is one too many, and the
          first question should not be competing with an animation. */}
      {settings && !settings.onboarding?.completed && !setupClosed && (
        <Onboarding
          onDone={() => {
            setSetupClosed(true)
            notifyDataChanged()
            // Re-read rather than patch: onboarding writes hours and day
            // parts, and the plan is built from both.
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
    </TodosProvider>
    </AssistantProvider>
    </UndoProvider>
  )
}
