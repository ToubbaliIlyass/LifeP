'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import type { Settings } from '@/lib/settings'
import { EVERYDAY_COLOR, IDENTITY_COLORS, WORLD_KINDS, colorOf, type Identity, type WorldKind, type WorldPayload } from '@/lib/identity'
import { useDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'
import { useTodos } from '@/components/todos/TodosProvider'
import { WorldCanvas } from './WorldCanvas'
import { WORLD_META } from './meta'

/** Ways to finish "I’m becoming …", for a first identity. */
const SUGGESTIONS = ['a runner', 'a reader', 'someone who writes', 'a good friend', 'someone who ships', 'calm']

const SECTION = 'text-[14px] font-bold text-primary mt-8 mb-2.5 pb-1.5 border-b border-border/80'
const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12.5px] leading-4 transition-colors'

/**
 * Becoming: who the to-dos are making you.
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
  const [lookBack, setLookBack] = useState(0)
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

  async function add(name: string) {
    const n = name.trim()
    if (!n) return
    setDraft('')
    const res = await fetch('/api/identities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
    if (res.ok) {
      const { identity } = (await res.json()) as { identity: Identity }
      setOpen(identity.id)
      load()
    }
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
  const sources = useMemo(() => {
    const live = lists.filter((l) => !l.done)
    const habits = todos.filter((t) => t.type === 'Habit')
    const tags = [...new Set(todos.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b))
    return { areas: live.filter((l) => l.kind === 'area'), projects: live.filter((l) => l.kind === 'project'), habits, tags }
  }, [todos, lists])

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
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto max-w-[860px] px-12 max-md:px-[18px] pt-10 max-md:pt-2 pb-16 text-[14px] max-md:text-[15px]">
        <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>

        <header className="flex flex-wrap items-center gap-x-2 gap-y-3 mb-1">
          <h1 className="min-w-0 flex items-center gap-2.5 text-[22px] font-bold leading-7 tracking-tight">
            <Icon className="w-[22px] h-[22px] shrink-0 text-violet-500" />
            Becoming
          </h1>
          <span className="flex-1" />
          {/* Which world: one press, and it is rebuilt from the same votes. */}
          <div role="radiogroup" aria-label="World" className="flex rounded-lg bg-foreground/[0.06] p-0.5">
            {WORLD_KINDS.map((k) => {
              const { name, Icon: KI } = WORLD_META[k]
              const on = world.kind === k
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={on}
                  onClick={() => { if (!on) { setLookBack(0); saveWorld({ kind: k }) } }}
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium transition ${on ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <KI className="w-3.5 h-3.5" />{name}
                </button>
              )
            })}
          </div>
        </header>
        <p className="mb-4 text-muted-foreground">Every to-do you finish is a vote for who you’re becoming. {WORLD_META[world.kind].blurb}</p>

        {!world.enabled && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-violet-500/10 px-3 py-2.5 text-[13px]">
            <span className="flex-1 min-w-[220px]">This is off, so it isn’t in the sidebar. Your votes are counted either way.</span>
            <button onClick={() => saveWorld({ enabled: true })} className="rounded-md bg-violet-600 text-white px-2.5 py-1 font-semibold hover:opacity-90">Show it in the sidebar</button>
          </div>
        )}

        {/* The world. */}
        <div className="relative rounded-xl overflow-hidden bg-[#05060b] shadow-[0_1px_2px_rgba(0,0,0,.06),0_20px_50px_-24px_rgba(0,0,0,.45)]">
          {data ? (
            <WorldCanvas kind={world.kind} data={data} lookBack={lookBack} className="aspect-[16/10] max-md:aspect-[4/5]" />
          ) : (
            <div className="aspect-[16/10] max-md:aspect-[4/5]" />
          )}
          <div className="pointer-events-none absolute left-0 right-0 bottom-0 flex items-end gap-4 p-4 bg-gradient-to-t from-black/55 to-transparent text-white">
            <div>
              <div className="text-[28px] font-bold leading-none tracking-tight tabular-nums">{total.toLocaleString()}</div>
              <div className="mt-1 text-[12.5px] text-white/75">{total === 1 ? 'vote' : 'votes'} · <span className="tabular-nums">{week}</span> this week</div>
            </div>
            <span className="flex-1" />
            {world.kind === 'path' && total > 30 && (
              <label className="pointer-events-auto flex items-center gap-2 text-[12px] text-white/80">
                Look back
                <input type="range" min={0} max={1} step={0.001} value={lookBack} onChange={(e) => setLookBack(Number(e.target.value))} className="w-28 accent-white" />
              </label>
            )}
          </div>
          {data && total === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center px-6 text-[15px] text-white/85">
              {world.kind === 'sky' ? 'The first thing you finish lights the first star.' : world.kind === 'path' ? 'The first thing you finish is the first step.' : 'The first thing you finish lays the first floor.'}
            </p>
          )}
        </div>

        {/* Who. */}
        <h2 className={SECTION}>Who you’re becoming</h2>
        <div className="flex flex-col">
          {data?.identities.map((idt, g) => {
            const color = colorOf(g, hues)
            const expanded = open === idt.id
            return (
              <div key={idt.id} className="border-b border-border/60 last:border-b-0">
                <div className="flex items-center gap-2.5 py-1.5">
                  <button
                    onClick={() => patch(idt.id, { hue: (idt.hue + 1) % IDENTITY_COLORS.length })}
                    title="Change its colour"
                    aria-label={`Change the colour of ${idt.name}`}
                    className="w-3.5 h-3.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background ring-transparent hover:ring-foreground/15"
                    style={{ background: color }}
                  />
                  <span className="text-muted-foreground shrink-0">I’m becoming</span>
                  <input
                    defaultValue={idt.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== idt.name) patch(idt.id, { name: v }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    aria-label="Who"
                    className="flex-1 min-w-0 bg-transparent font-semibold outline-none rounded px-1 -mx-1 focus:bg-foreground/[0.05]"
                  />
                  <span className="text-[12.5px] text-muted-foreground tabular-nums shrink-0">{idt.votes}{idt.week > 0 && <span className="max-sm:hidden"> · {idt.week} this week</span>}</span>
                  <button onClick={() => setOpen(expanded ? null : idt.id)} aria-expanded={expanded} className="flex items-center gap-1 shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]">
                    What counts <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {expanded && (
                  <div className="pb-3 pl-6 flex flex-col gap-3">
                    {!idt.listIds.length && !idt.itemIds.length && !idt.tags.length && (
                      <p className="text-[12.5px] text-muted-foreground">Nothing counts toward it yet. Pick the lists, habits or tags that are this person’s work — everything finished in them, past and future, becomes a vote.</p>
                    )}
                    <Pick label="Areas and projects" empty="No lists yet." items={[...sources.areas, ...sources.projects].map((l) => ({ key: l.id, label: l.title || 'Untitled', on: idt.listIds.includes(l.id) }))} color={color} onToggle={(k) => toggle(idt, 'listIds', k as number)} />
                    <Pick label="Habits" empty="No habits yet." items={sources.habits.map((h) => ({ key: h.id, label: h.title || 'Untitled', on: idt.itemIds.includes(h.id) }))} color={color} onToggle={(k) => toggle(idt, 'itemIds', k as number)} />
                    <Pick label="Tags" empty="No tags yet." items={sources.tags.map((t) => ({ key: t, label: t, on: idt.tags.some((x) => x.toLowerCase() === t.toLowerCase()) }))} color={color} onToggle={(k) => toggle(idt, 'tags', k as string)} />
                    <button onClick={() => forget(idt)} className="self-start flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" /> Forget this one
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* The everyday: whatever counts toward nobody in particular. */}
          {data && (
            <div className="flex items-center gap-2.5 py-1.5 text-muted-foreground border-b border-border/60">
              <span className="w-3.5 h-3.5 shrink-0 rounded-full" style={{ background: EVERYDAY_COLOR, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
              <span className="flex-1">The everyday <span className="text-[12.5px]">— everything else you finish</span></span>
              <span className="text-[12.5px] tabular-nums">{data.everyday.votes}</span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); add(draft) }} className="flex items-center gap-2.5 py-2">
            <Plus className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground shrink-0">I’m becoming</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="a runner, a writer, a good friend…" aria-label="Who you’re becoming" className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60" />
            {draft.trim() && <button type="submit" className="rounded-md bg-primary text-primary-foreground px-2.5 py-0.5 text-[13px] font-semibold">Add</button>}
          </form>
          {data && data.identities.length === 0 && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => add(s)} className={`${CHIP} border-border/80 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]`}>{s}</button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-[12.5px] leading-relaxed text-muted-foreground max-w-[64ch]">
          Why votes? We come to know who we are partly by watching what we do, so every small thing finished is evidence. A vote never expires, and a missed day takes nothing away — the world only ever grows. Drag it to look around.
        </p>
      </div>
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
      <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground/70">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onToggle(it.key)}
              aria-pressed={it.on}
              className={`${CHIP} ${it.on ? 'font-medium text-foreground' : 'border-border/80 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'}`}
              style={it.on ? { borderColor: color, background: `color-mix(in oklab, ${color} 18%, transparent)` } : undefined}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
