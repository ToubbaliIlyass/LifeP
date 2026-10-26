'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, Maximize2, Minimize2, Plus, Trash2, Users, X } from 'lucide-react'
import type { Settings } from '@/lib/settings'
import { EVERYDAY_COLOR, IDENTITY_COLORS, WORLD_KINDS, colorOf, nextHue, suggestSources, type Identity, type WorldKind, type WorldPayload } from '@/lib/identity'
import { useDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'
import { useTodos } from '@/components/todos/TodosProvider'
import { WorldCanvas } from './WorldCanvas'
import { WORLD_META } from './meta'

/** Ways to finish "I’m becoming …", for a first identity. */
const SUGGESTIONS = ['a runner', 'a reader', 'someone who writes', 'a good friend', 'someone who ships', 'calm']

const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12.5px] leading-4 transition-colors'
/** Frosted glass over the world: the controls float on it rather than sitting in a panel beside it. */
const GLASS = 'bg-[rgba(16,16,24,.46)] backdrop-blur-xl border border-white/15 shadow-[0_8px_30px_rgba(0,0,0,.25)] text-white'

/**
 * Your World: who the to-dos are making you, as a place.
 *
 * Full-bleed on purpose: the world is the page, not a picture on it. The
 * name, the switch between worlds, the count and the people you are
 * becoming float over it on glass, the people in a panel that tucks away,
 * and one press takes the whole thing full screen.
 *
 * The idea, from the psychology of habits: we come to know who we are partly
 * by watching what we do, so every finished to-do is a small vote for a kind
 * of person. Name the people you are becoming, say which lists, habits and
 * tags count toward each, and the world — a sky, a path or a town, the
 * user's choice — grows a little with every vote.
 *
 * Deliberately gentle as games go. No points to lose, no streak to break,
 * no one to compete with: a vote never expires and a missed day takes
 * nothing away. Recent votes glow a little brighter; that is all the
 * pressure there is.
 */
export function WorldView({ settings, onSettingsChanged, onOpenMenu }: {
  settings: Settings | null
  onSettingsChanged: (next: Settings) => void
  onOpenMenu: () => void
}) {
  const { todos, lists } = useTodos()
  const [data, setData] = useState<WorldPayload | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  /** A name just typed, with what looks like it ticked, waiting for a yes before it counts. */
  const [guide, setGuide] = useState<{ name: string; listIds: number[]; itemIds: number[]; tags: string[] } | null>(null)
  /** The people panel: open on a wide screen, tucked away on a phone until asked for. */
  const [panel, setPanel] = useState(true)
  const [full, setFull] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  /** What the panel covers, so the world is framed beside it (a side panel) or above it (a sheet). */
  const [insets, setInsets] = useState<[number, number]>([0, 0])
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const measure = () => {
      if (!panel) { setInsets([0, 0]); return }
      const wide = window.innerWidth >= 768
      setInsets(wide ? [el.offsetWidth + 32, 0] : [0, el.offsetHeight + 16])
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [panel, data])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so server and first client render agree
    if (window.innerWidth < 768) setPanel(false)
    const onFull = () => setFull(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onFull)
    return () => document.removeEventListener('fullscreenchange', onFull)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }
  const world = settings?.world ?? { enabled: false, kind: 'sky' as WorldKind }

  const load = useCallback(() => {
    const tz = clockZone()
    fetch(`/api/world${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WorldPayload | null) => { if (d) setData(d) })
      .catch(() => {})
  }, [])
  useEffect(load, [load])
  useDataChanged(load)

  async function saveWorld(next: Partial<Settings['world']>) {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ world: { ...world, ...next } }),
    })
    if (res.ok) onSettingsChanged(((await res.json()) as { settings: Settings }).settings)
  }

  const sources = (() => {
    const live = lists.filter((l) => !l.done)
    const habits = todos.filter((t) => t.type === 'Habit')
    const tags = [...new Set(todos.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b))
    return { areas: live.filter((l) => l.kind === 'area'), projects: live.filter((l) => l.kind === 'project'), habits, tags }
  })()

  /** Creates it, with whatever was chosen to count toward it. */
  async function create(name: string, picked: { listIds: number[]; itemIds: number[]; tags: string[] }) {
    setDraft('')
    setGuide(null)
    const res = await fetch('/api/identities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ...picked }) })
    if (res.ok) {
      const { identity } = (await res.json()) as { identity: Identity }
      setOpen(picked.listIds.length || picked.itemIds.length || picked.tags.length ? null : identity.id)
      load()
    }
  }

  /** A name typed: if there is anything it could count, offer the likely ones first; otherwise just make it. */
  function add(name: string) {
    const n = name.trim()
    if (!n) return
    const anything = sources.areas.length + sources.projects.length + sources.habits.length + sources.tags.length > 0
    if (!anything) { void create(n, { listIds: [], itemIds: [], tags: [] }); return }
    setDraft(n)
    setGuide({ name: n, ...suggestSources(n, { lists: [...sources.areas, ...sources.projects], habits: sources.habits, tags: sources.tags }) })
  }

  async function patch(id: number, changes: Partial<Identity>) {
    // Drawn at once; the world catches up when the server has counted again.
    setData((d) => d && { ...d, identities: d.identities.map((i) => (i.id === id ? { ...i, ...changes } : i)) })
    await fetch(`/api/identities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    load()
  }

  async function forget(idt: Identity) {
    if (!confirm(`Forget “${idt.name}”? Its votes stay, and count toward the everyday.`)) return
    await fetch(`/api/identities/${idt.id}`, { method: 'DELETE' })
    load()
  }

  // What can count toward an identity, from the lists themselves.


  const total = data?.votes.length ?? 0
  const week = data ? data.identities.reduce((s, i) => s + i.week, 0) + data.everyday.week : 0
  const hues = data?.identities.map((i) => i.hue) ?? []
  const { Icon } = WORLD_META[world.kind]

  const toggle = (idt: Identity, key: 'listIds' | 'itemIds' | 'tags', value: number | string) => {
    const had = (idt[key] as (number | string)[]).includes(value)
    const next = had ? (idt[key] as (number | string)[]).filter((x) => x !== value) : [...idt[key], value]
    patch(idt.id, { [key]: next } as Partial<Identity>)
  }

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-[#141413] text-white select-none">
      {/* The world, edge to edge. */}
      {data && <WorldCanvas kind={world.kind} data={data} insets={insets} className="absolute inset-0" />}

      {/* Along the top: where you are, which world, and the buttons. */}
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2 p-4 max-md:p-3 bg-gradient-to-b from-black/45 via-black/15 to-transparent pointer-events-none">
        <button onClick={onOpenMenu} aria-label="Back to lists" className={`md:hidden pointer-events-auto grid place-items-center w-10 h-10 rounded-full ${GLASS}`}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 pr-2 [text-shadow:0_1px_12px_rgba(0,0,0,.45)]">
          <h1 className="flex items-center gap-2 text-[24px] max-md:text-[20px] font-bold leading-tight tracking-tight">
            <Icon className="w-[22px] h-[22px] shrink-0 text-amber-300" />
            Your World
          </h1>
          <p className="mt-0.5 text-[13px] text-white/80 max-md:hidden">Every to-do you finish is a vote for who you’re becoming.</p>
        </div>
        <span className="flex-1" />
        <div role="radiogroup" aria-label="World" className={`pointer-events-auto flex rounded-full p-1 ${GLASS} max-md:order-last max-md:w-full max-md:justify-between`}>
          {WORLD_KINDS.map((k) => {
            const { name, Icon: KI } = WORLD_META[k]
            const on = world.kind === k
            return (
              <button
                key={k}
                role="radio"
                aria-checked={on}
                onClick={() => { if (!on) saveWorld({ kind: k }) }}
                className={`flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium transition max-md:flex-1 ${on ? 'bg-white text-[#16161d] shadow' : 'text-white/80 hover:text-white'}`}
              >
                <KI className="w-3.5 h-3.5" />{name}
              </button>
            )
          })}
        </div>
        <button onClick={() => setPanel((p) => !p)} aria-pressed={panel} title="Who you’re becoming" className={`pointer-events-auto flex items-center gap-1.5 h-10 px-3.5 rounded-full text-[13px] font-medium ${GLASS} ${panel ? 'ring-1 ring-white/50' : ''}`}>
          <Users className="w-4 h-4" /><span className="max-sm:hidden">Who you’re becoming</span>
        </button>
        <button onClick={toggleFull} title={full ? 'Leave full screen' : 'Full screen'} aria-label={full ? 'Leave full screen' : 'Full screen'} className={`pointer-events-auto grid place-items-center w-10 h-10 rounded-full ${GLASS}`}>
          {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {!world.enabled && (
        <div className={`absolute z-10 left-1/2 -translate-x-1/2 top-[84px] max-md:top-[118px] flex items-center gap-3 rounded-full pl-4 pr-1.5 py-1.5 text-[13px] ${GLASS}`}>
          <span>Not in your sidebar yet.</span>
          <button onClick={() => saveWorld({ enabled: true })} className="rounded-full bg-white text-[#16161d] px-3 py-1 font-semibold hover:opacity-90">Add it</button>
        </div>
      )}

      {data && total === 0 && (
        <p className="absolute inset-x-0 top-[42%] z-10 text-center px-6 text-[17px] font-medium [text-shadow:0_2px_16px_rgba(0,0,0,.6)]">
          {world.kind === 'sky' ? 'The first thing you finish lights the first star.' : world.kind === 'path' ? 'The first thing you finish is the first step.' : 'The first thing you finish lays the first floor.'}
        </p>
      )}

      {/* The count, bottom left; how to move round it, bottom right. */}
      <div className={`absolute z-10 left-4 bottom-4 max-md:left-3 max-md:bottom-3 rounded-2xl px-4 py-3 ${GLASS}`}>
        <div className="text-[30px] max-md:text-[24px] font-bold leading-none tracking-tight tabular-nums">{total.toLocaleString()}</div>
        <div className="mt-1 text-[12.5px] text-white/75">{total === 1 ? 'vote' : 'votes'} · <span className="tabular-nums">{week}</span> this week</div>
      </div>
      <p className="absolute z-10 right-4 bottom-4 text-[12px] text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,.6)] max-md:hidden pointer-events-none">Drag to turn · scroll to zoom</p>

      {/* Who you’re becoming: a glass panel on the right, a sheet from the bottom on a phone. */}
      <aside
        ref={panelRef}
        aria-label="Who you’re becoming"
        className={`absolute z-20 ${GLASS} rounded-2xl flex flex-col transition-all duration-300
          md:right-4 md:top-[76px] md:bottom-4 md:w-[380px]
          max-md:inset-x-2 max-md:bottom-2 max-md:max-h-[64%]
          ${panel ? 'opacity-100 translate-x-0 translate-y-0' : 'opacity-0 pointer-events-none md:translate-x-6 max-md:translate-y-6'}`}
      >
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 border-b border-white/10">
          <h2 className="flex-1 text-[15px] font-semibold">Who you’re becoming</h2>
          <button onClick={() => setPanel(false)} aria-label="Close" className="grid place-items-center w-7 h-7 rounded-full text-white/70 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 text-[14px]">
          {data?.identities.map((idt, g) => {
            const color = colorOf(g, hues)
            const expanded = open === idt.id
            return (
              <div key={idt.id} className="border-b border-white/10 last:border-b-0">
                <div className="flex items-center gap-2.5 py-2">
                  <button
                    onClick={() => patch(idt.id, { hue: (idt.hue + 1) % IDENTITY_COLORS.length })}
                    title="Change its colour"
                    aria-label={`Change the colour of ${idt.name}`}
                    className="w-3.5 h-3.5 shrink-0 rounded-full ring-2 ring-white/0 hover:ring-white/40 ring-offset-2 ring-offset-transparent"
                    style={{ background: color }}
                  />
                  <input
                    defaultValue={idt.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== idt.name) patch(idt.id, { name: v }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    aria-label="Who"
                    className="flex-1 min-w-0 bg-transparent font-semibold outline-none rounded px-1 -mx-1 focus:bg-white/10"
                  />
                  <span className="text-[12.5px] text-white/70 tabular-nums shrink-0">{idt.votes}{idt.week > 0 && <span> · +{idt.week}</span>}</span>
                  <button onClick={() => setOpen(expanded ? null : idt.id)} aria-expanded={expanded} aria-label="What counts" title="What counts" className="grid place-items-center w-7 h-7 shrink-0 rounded-full text-white/70 hover:text-white hover:bg-white/10">
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {expanded && (
                  <div className="pb-3 pl-6 flex flex-col gap-3">
                    {!idt.listIds.length && !idt.itemIds.length && !idt.tags.length && (
                      <p className="text-[12.5px] text-white/70">Nothing counts toward them yet. Pick the lists, habits or tags that are this person’s work — everything finished in them, past and future, becomes a vote.</p>
                    )}
                    <Pick label="Areas and projects" empty="No lists yet." items={[...sources.areas, ...sources.projects].map((l) => ({ key: l.id, label: l.title || 'Untitled', on: idt.listIds.includes(l.id) }))} color={color} onToggle={(k) => toggle(idt, 'listIds', k as number)} />
                    <Pick label="Habits" empty="No habits yet." items={sources.habits.map((h) => ({ key: h.id, label: h.title || 'Untitled', on: idt.itemIds.includes(h.id) }))} color={color} onToggle={(k) => toggle(idt, 'itemIds', k as number)} />
                    <Pick label="Tags" empty="No tags yet." items={sources.tags.map((t) => ({ key: t, label: t, on: idt.tags.some((x) => x.toLowerCase() === t.toLowerCase()) }))} color={color} onToggle={(k) => toggle(idt, 'tags', k as string)} />
                    <button onClick={() => forget(idt)} className="self-start flex items-center gap-1.5 text-[12.5px] text-white/60 hover:text-red-300">
                      <Trash2 className="w-3.5 h-3.5" /> Forget this one
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* The everyday: whatever counts toward nobody in particular. */}
          {data && (
            <div className="flex items-center gap-2.5 py-2 text-white/75 border-b border-white/10">
              <span className="w-3.5 h-3.5 shrink-0 rounded-full" style={{ background: EVERYDAY_COLOR }} />
              <span className="flex-1">The everyday <span className="text-[12px] text-white/55">— everything else</span></span>
              <span className="text-[12.5px] tabular-nums">{data.everyday.votes}</span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); if (guide) void create(guide.name, guide); else add(draft) }} className="flex items-center gap-2.5 pt-3 pb-1">
            <Plus className="w-3.5 h-3.5 shrink-0 text-white/60" />
            <input value={draft} onChange={(e) => { setDraft(e.target.value); setGuide(null) }} placeholder="I’m becoming… a runner, a writer" aria-label="Who you’re becoming" className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-white/45" />
            {draft.trim() && !guide && <button type="submit" className="rounded-full bg-white text-[#16161d] px-3 py-0.5 text-[13px] font-semibold">Add</button>}
          </form>
          {guide && (
            // What looks like it belongs to them is already ticked; one press to agree, or change it first.
            <div className="mt-2 mb-1 rounded-xl border border-white/15 bg-white/[0.06] p-3 flex flex-col gap-3">
              <p className="text-[13px] text-white/80">
                What counts toward <b className="font-semibold text-white">{guide.name}</b>? Everything finished in these, past and future, becomes a vote.
                {!guide.listIds.length && !guide.itemIds.length && !guide.tags.length && <span className="text-white/60"> Nothing matched by name — pick any, or add it and choose later.</span>}
              </p>
              {(() => {
                const color = colorOf(data?.identities.length ?? 0, [...(data?.identities.map((i) => i.hue) ?? []), nextHue(data?.identities ?? [])])
                const flip = (key: 'listIds' | 'itemIds' | 'tags', v: number | string) =>
                  setGuide((g) => g && { ...g, [key]: (g[key] as (number | string)[]).includes(v) ? (g[key] as (number | string)[]).filter((x) => x !== v) : [...(g[key] as (number | string)[]), v] })
                return (
                  <>
                    {sources.areas.length + sources.projects.length > 0 && <Pick label="Areas and projects" empty="" items={[...sources.areas, ...sources.projects].map((l) => ({ key: l.id, label: l.title || 'Untitled', on: guide.listIds.includes(l.id) }))} color={color} onToggle={(k) => flip('listIds', k as number)} />}
                    {sources.habits.length > 0 && <Pick label="Habits" empty="" items={sources.habits.map((h) => ({ key: h.id, label: h.title || 'Untitled', on: guide.itemIds.includes(h.id) }))} color={color} onToggle={(k) => flip('itemIds', k as number)} />}
                    {sources.tags.length > 0 && <Pick label="Tags" empty="" items={sources.tags.map((t) => ({ key: t, label: t, on: guide.tags.includes(t) }))} color={color} onToggle={(k) => flip('tags', k as string)} />}
                  </>
                )
              })()}
              <div className="flex items-center gap-2">
                <button onClick={() => void create(guide.name, guide)} className="rounded-full bg-white text-[#16161d] px-3.5 py-1 text-[13px] font-semibold">Add</button>
                <button onClick={() => setGuide(null)} className="rounded-full px-3 py-1 text-[13px] text-white/70 hover:text-white hover:bg-white/10">Back</button>
              </div>
            </div>
          )}
          {data && data.identities.length === 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {SUGGESTIONS.map((sg) => (
                <button key={sg} onClick={() => add(sg)} className={`${CHIP} border-white/25 text-white/80 hover:text-white hover:bg-white/10`}>{sg}</button>
              ))}
            </div>
          )}
          <p className="mt-5 text-[12px] leading-relaxed text-white/60">
            We come to know who we are partly by watching what we do, so every small thing finished is evidence. A vote never expires, and a missed day takes nothing away.
          </p>
        </div>
      </aside>
    </div>
  )
}

function Pick({ label, empty, items, color, onToggle }: {
  label: string
  empty: string
  items: { key: number | string; label: string; on: boolean }[]
  color: string
  onToggle: (key: number | string) => void
}) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-white/65">{label}</div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-white/50">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onToggle(it.key)}
              aria-pressed={it.on}
              className={`${CHIP} ${it.on ? 'font-medium text-white' : 'border-white/20 text-white/70 hover:text-white hover:bg-white/10'}`}
              style={it.on ? { borderColor: color, background: `color-mix(in oklab, ${color} 30%, transparent)` } : undefined}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
