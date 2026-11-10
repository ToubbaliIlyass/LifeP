'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, Mic, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { IDENTITY_COLORS, colorOf, type Identity, type IdentityStats, type Receipt, type WorldPayload } from '@/lib/identity'
import { useDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'
import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import { startListening } from '@/components/today/TodayAssistant'

const SUGGESTIONS = ['a runner', 'a reader', 'someone who writes', 'a good friend', 'someone who ships', 'calm']

interface Suggestion { name: string; listIds: number[]; itemIds: number[]; tags: string[] }
type Draft = { name: string; listIds: number[]; itemIds: number[]; tags: string[]; loading: boolean }

/** Votes per day for one identity over the last seven days, oldest first. */
function weekBars(votes: WorldPayload['votes'], group: number): number[] {
  const out = new Array(7).fill(0) as number[]
  for (const [age, g] of votes) if (g === group && age >= 0 && age < 7) out[6 - age]++
  return out
}

/** "Today", "Yesterday", a weekday within the week, otherwise the date. */
function dayLabel(date: string, today: string): string {
  const a = Date.parse(date + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  const days = Math.round((b - a) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return new Date(a).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return new Date(a).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * Identity: who your to-dos are making you, as evidence.
 *
 * One card per person you are becoming, each with the number, the receipts
 * behind it (the last few things that counted, by name and day), the next
 * thing that would add to it, and what counts toward it. *
 * Saying it is Tuck's job: the Tell Tuck button anywhere in the app takes
 * "I want to be a runner" and adds it. Typing a name is here for when you
 * would rather, and either way you see what was matched and take out what
 * is wrong.
 */
export function IdentityPage({ onOpenMenu, dock }: {
  onOpenMenu: () => void
  /** The assistant's island, so saying it works right here. */
  dock: ReactNode
}) {
  const { todos, lists, toggle } = useTodos()
  const [data, setData] = useState<WorldPayload | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [finding, setFinding] = useState(false)
  const asked = useRef(false)

  const load = useCallback(() => {
    const tz = clockZone()
    fetch(`/api/world${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WorldPayload | null) => { if (d) setData(d) })
      .catch(() => {})
  }, [])
  useEffect(load, [load])
  useDataChanged(load)

  const live = lists.filter((l) => !l.done)
  const areas = live.filter((l) => l.kind === 'area')
  const projects = live.filter((l) => l.kind === 'project')
  const items = todos.filter((t) => !t.prayerKey && !t.done && t.title.trim()).slice(0, 100)
  const tags = [...new Set(todos.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b))
  const hasMaterial = areas.length + projects.length + items.length + tags.length > 0 || todos.some((t) => t.done)

  const findSuggestions = useCallback(async () => {
    setFinding(true)
    try {
      const res = await fetch('/api/identities/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = (await res.json().catch(() => ({}))) as { suggestions?: Suggestion[] }
      setSuggestions(d.suggestions ?? [])
    } catch {
      setSuggestions([])
    }
    setFinding(false)
  }, [])
  useEffect(() => {
    if (data && hasMaterial && !asked.current) { asked.current = true; void findSuggestions() }
  }, [data, hasMaterial, findSuggestions])

  async function create(n: string, picked: { listIds: number[]; itemIds: number[]; tags: string[] }) {
    setName('')
    setDraft(null)
    const res = await fetch('/api/identities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, ...picked }) })
    if (res.ok) {
      setSuggestions((all) => all && all.filter((s) => s.name.toLowerCase() !== n.toLowerCase()))
      load()
    }
  }

  /** A typed name: what already counts toward it is looked up in their own lists, to be trimmed. */
  async function add(raw: string) {
    const n = raw.trim()
    if (!n) return
    if (!hasMaterial) { void create(n, { listIds: [], itemIds: [], tags: [] }); return }
    setDraft({ name: n, listIds: [], itemIds: [], tags: [], loading: true })
    try {
      const res = await fetch('/api/identities/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: [n] }) })
      const m = ((await res.json()) as { matches: { listIds: number[]; itemIds: number[]; tags: string[] }[] }).matches[0]
      setDraft((d) => (d && d.name === n ? { ...d, ...(m ?? {}), loading: false } : d))
    } catch {
      setDraft((d) => (d && d.name === n ? { ...d, loading: false } : d))
    }
  }

  async function patch(id: number, changes: Partial<Identity>) {
    setData((d) => d && { ...d, identities: d.identities.map((i) => (i.id === id ? { ...i, ...changes } : i)) })
    await fetch(`/api/identities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    load()
  }
  async function forget(idt: Identity) {
    if (!confirm(`Forget “${idt.name}”? Its votes stay, and count toward the everyday.`)) return
    await fetch(`/api/identities/${idt.id}`, { method: 'DELETE' })
    load()
  }

  const labelFor = (kind: 'l' | 'h' | 't', id: number | string) =>
    kind === 'l' ? [...areas, ...projects].find((l) => l.id === id)?.title : kind === 'h' ? todos.find((h) => h.id === id)?.title : `#${id}`
  const identities = data?.identities ?? []
  /** Open to-dos that count toward no one yet: what might be the work of this person. */
  const claimed = new Set(identities.flatMap((i) => i.itemIds))
  const candidatesFor = (idt: IdentityStats) => {
    const stems = idt.name.toLowerCase().split(/\W+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 3))
    const free = todos.filter((t) => t.type === 'Task' && !t.done && t.id > 0 && !claimed.has(t.id) && t.title.trim())
    const score = (t: { title: string }) => stems.filter((st) => t.title.toLowerCase().includes(st)).length
    return [...free].sort((a, b) => score(b) - score(a)).slice(0, 4).map((t) => ({ id: t.id, title: t.title }))
  }
  const hues = identities.map((i) => i.hue)
  const weekTotal = identities.reduce((n, i) => n + i.week, 0)
  const visible = (suggestions ?? []).filter((s) => !identities.some((i) => i.name.toLowerCase() === s.name.toLowerCase())).slice(0, 3)

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[740px] px-12 pb-44 pt-10 text-[length:calc(14px*var(--ts))] max-md:px-[18px] max-md:pt-2 max-md:text-[length:calc(15px*var(--ts))]">
        <div className="-mx-1.5 mb-2 flex h-9 items-center md:hidden">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground active:bg-foreground/[0.06]"><ChevronLeft className="h-6 w-6" /></button>
        </div>

        <header className="flex items-center gap-3">
          <h1 className="flex flex-1 items-center gap-2 text-[length:calc(26px*var(--ts))] font-bold leading-tight tracking-tight max-md:text-[length:calc(24px*var(--ts))]"><Sparkles className="h-6 w-6 text-primary" /> Identity</h1>
        </header>
        <p className="mt-1 text-[length:calc(14px*var(--ts))] text-muted-foreground">{identities.length > 0 && weekTotal > 0 ? <><b className="text-foreground">{weekTotal} vote{weekTotal === 1 ? '' : 's'}</b> this week for who you’re becoming.</> : 'Every to-do you finish is a vote for who you’re becoming.'}</p>

        {/* First run: nothing named yet. Say it, or take a suggestion. */}
        {data && identities.length === 0 && (
          <section className="mt-6 flex flex-col items-center rounded-2xl bg-foreground/[0.04] px-5 py-8 text-center">
            <Tuck state="empty-world" size={220} decorative />
            <h2 className="mt-2 text-[length:calc(22px*var(--ts))] font-bold tracking-tight">Who are you becoming?</h2>
            <p className="mt-1 max-w-[40ch] text-muted-foreground">Say it, and what you finish starts to count. “I want to be a runner.”</p>
            <button onClick={() => startListening('Who are you becoming?')} className="mt-4 inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-6 text-[length:calc(15px*var(--ts))] font-semibold text-primary-foreground shadow-md hover:opacity-90 active:scale-95"><Mic className="h-5 w-5" /> Tell Tuck</button>
          </section>
        )}

        {/* The people already named: the number, the receipts, what is next. */}
        {identities.length > 0 && (
          <ul className="mt-6 space-y-3">
            {identities.map((idt, g) => (
              <IdentityCard
                key={idt.id}
                idt={idt}
                color={colorOf(g, hues)}
                today={data!.today}
                bars={weekBars(data!.votes, g)}
                candidates={candidatesFor(idt)}
                onDoNext={(id) => { const t = todos.find((x) => x.id === id); if (t) { toggle(t); window.setTimeout(load, 600) } }}
                expanded={open === idt.id}
                onToggle={() => setOpen(open === idt.id ? null : idt.id)}
                onRename={(v) => patch(idt.id, { name: v })}
                onColor={() => patch(idt.id, { hue: (idt.hue + 1) % IDENTITY_COLORS.length })}
                onForget={() => forget(idt)}
                onChange={(changes) => patch(idt.id, changes)}
                labelFor={labelFor}
                pick={{ areas: [...areas, ...projects].map((l) => ({ id: l.id, title: l.title })), items: items.map((h) => ({ id: h.id, title: h.title })), tags }}
              />
            ))}
          </ul>
        )}

        {/* Read from what they already do. */}
        {hasMaterial && (finding || visible.length > 0) && (
          <section className="mt-8" aria-label="Suggested identities">
            <h2 className="mb-2 flex items-center gap-2 text-[length:calc(12px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Suggested from what you do
              {!finding && <button onClick={() => void findSuggestions()} className="ml-auto text-[length:calc(12px*var(--ts))] font-normal normal-case tracking-normal hover:text-foreground">Look again</button>}
            </h2>
            {finding && visible.length === 0 ? (
              <p className="rounded-xl bg-foreground/[0.05] px-4 py-3 text-muted-foreground">Looking through your lists and to-dos…</p>
            ) : (
              <ul className="space-y-2">
                {visible.map((sg) => (
                  <li key={sg.name} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card py-3 pl-4 pr-2.5">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[length:calc(15px*var(--ts))] font-semibold">{sg.name}</b>
                      <span className="block truncate text-[length:calc(12.5px*var(--ts))] text-muted-foreground">{[...sg.listIds.map((id) => labelFor('l', id)), ...sg.itemIds.map((id) => labelFor('h', id)), ...sg.tags.map((t) => `#${t}`)].filter(Boolean).slice(0, 4).join(' · ')}</span>
                    </div>
                    <button onClick={() => void create(sg.name, sg)} className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-[length:calc(13px*var(--ts))] font-semibold text-primary-foreground hover:opacity-90">Add</button>
                    <button onClick={() => setSuggestions((all) => all && all.filter((x) => x.name !== sg.name))} aria-label={`Not ${sg.name}`} title="Not me" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]"><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Type one, if that is easier than saying it. */}
        <section className="mt-8" aria-label="Add an identity">
          <h2 className="mb-2 text-[length:calc(12px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">{identities.length ? 'Add another' : 'Or type it'}</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (draft) void create(draft.name, draft); else void add(name) }} className="flex items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-foreground/[0.06] pl-4 pr-1.5 focus-within:ring-1 focus-within:ring-primary">
              <input value={name} onChange={(e) => { setName(e.target.value); setDraft(null) }} placeholder="a runner, someone who writes…" aria-label="Add an identity" className="min-w-0 flex-1 bg-transparent text-[length:calc(15px*var(--ts))] outline-none placeholder:text-muted-foreground/70" />
              {name.trim() && !draft && <button type="submit" aria-label="Add" className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></button>}
            </div>
            <button type="button" onClick={() => startListening('Who are you becoming?')} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-[length:calc(14px*var(--ts))] font-semibold text-primary-foreground hover:opacity-90"><Mic className="h-4 w-4" /> Tell Tuck</button>
          </form>

          {draft && (
            <DraftReview
              draft={draft}
              labelFor={labelFor}
              onDrop={(kind, id) => setDraft((d) => d && ({ ...d, listIds: kind === 'l' ? d.listIds.filter((x) => x !== id) : d.listIds, itemIds: kind === 'h' ? d.itemIds.filter((x) => x !== id) : d.itemIds, tags: kind === 't' ? d.tags.filter((x) => x !== id) : d.tags }))}
              onAdd={() => void create(draft.name, draft)}
              onBack={() => setDraft(null)}
            />
          )}

          {identities.length === 0 && !draft && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.filter(() => visible.length === 0).map((sg) => (
                <button key={sg} onClick={() => void add(sg)} className="inline-flex items-center rounded-full border border-border/80 px-3 py-1 text-[length:calc(13px*var(--ts))] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">{sg}</button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* The assistant, so saying it works right here. */}
      <div className="pointer-events-none sticky bottom-0 z-10">
        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[740px] px-12 pb-6 max-md:px-[18px] max-md:pb-[calc(env(safe-area-inset-bottom)+12px)]">{dock}</div>
      </div>
    </div>
  )
}

function DraftReview({ draft, labelFor, onDrop, onAdd, onBack }: {
  draft: Draft
  labelFor: (kind: 'l' | 'h' | 't', id: number | string) => string | undefined
  onDrop: (kind: 'l' | 'h' | 't', id: number | string) => void
  onAdd: () => void
  onBack: () => void
}) {
  const chosen = [
    ...draft.listIds.map((id) => ({ key: `l${id}`, kind: 'l' as const, id, label: labelFor('l', id) })),
    ...draft.itemIds.map((id) => ({ key: `h${id}`, kind: 'h' as const, id, label: labelFor('h', id) })),
    ...draft.tags.map((t) => ({ key: `t${t}`, kind: 't' as const, id: t, label: `#${t}` })),
  ].filter((c) => c.label)
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-muted-foreground">
        {draft.loading ? <>Looking through your lists for <b className="text-foreground">{draft.name}</b>…</>
          : chosen.length ? <>These count toward <b className="text-foreground">{draft.name}</b>. Tap anything that isn’t right to take it out.</>
          : <>Nothing in your lists fits <b className="text-foreground">{draft.name}</b> yet. Add it, and pick what counts later.</>}
      </p>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <button key={c.key} onClick={() => onDrop(c.kind, c.id)} aria-label={`Remove ${c.label}`} title="Not this one" className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-[length:calc(13px*var(--ts))] hover:bg-destructive/15">{c.label}<X className="h-3 w-3 opacity-60" /></button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={onAdd} disabled={draft.loading} className="rounded-full bg-primary px-5 py-2 text-[length:calc(14px*var(--ts))] font-semibold text-primary-foreground disabled:opacity-50">Add</button>
        <button onClick={onBack} className="rounded-full px-4 py-2 text-[length:calc(14px*var(--ts))] text-muted-foreground hover:bg-foreground/[0.06]">Cancel</button>
      </div>
    </div>
  )
}

function IdentityCard({ idt, color, today, bars, expanded, onToggle, onRename, onColor, onForget, onChange, candidates, onDoNext, labelFor, pick }: {
  idt: IdentityStats
  color: string
  today: string
  /** Votes for each of the last seven days, oldest first. */
  bars: number[]
  expanded: boolean
  onToggle: () => void
  onRename: (v: string) => void
  onColor: () => void
  onForget: () => void
  onChange: (changes: Partial<Identity>) => void
  /** Open to-dos that count for no one: tap one and it counts toward this. */
  candidates: { id: number; title: string }[]
  /** Finish the next step right here. */
  onDoNext: (id: number) => void
  labelFor: (kind: 'l' | 'h' | 't', id: number | string) => string | undefined
  pick: { areas: { id: number; title: string }[]; items: { id: number; title: string }[]; tags: string[] }
}) {
  const counts = [
    ...idt.listIds.map((id) => ({ key: `l${id}`, label: labelFor('l', id), drop: () => onChange({ listIds: idt.listIds.filter((x) => x !== id) }) })),
    ...idt.itemIds.map((id) => ({ key: `h${id}`, label: labelFor('h', id), drop: () => onChange({ itemIds: idt.itemIds.filter((x) => x !== id) }) })),
    ...idt.tags.map((t) => ({ key: `t${t}`, label: `#${t}`, drop: () => onChange({ tags: idt.tags.filter((x) => x !== t) }) })),
  ].filter((c) => c.label)
  const toggleIn = (key: 'listIds' | 'itemIds' | 'tags', v: number | string) => {
    const cur = idt[key] as (number | string)[]
    onChange({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<Identity>)
  }
  const top = Math.max(1, ...bars)
  return (
    <li className="rounded-2xl border border-border/70 bg-card">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onColor} title="Change its colour" aria-label={`Change the colour of ${idt.name}`} className="h-3 w-3 shrink-0 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-card hover:ring-foreground/30" style={{ background: color }} />
          <input
            defaultValue={idt.name}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== idt.name) onRename(v) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label="Who"
            className="-mx-1 min-w-0 flex-1 rounded bg-transparent px-1 text-[length:calc(17px*var(--ts))] font-semibold tracking-tight outline-none focus:bg-foreground/[0.06]"
          />
          <div className="flex h-5 w-14 shrink-0 items-end gap-[3px]" role="img" aria-label={`Votes in the last seven days: ${bars.join(', ')}`}>
            {bars.map((n, i) => (
              <span key={i} className="flex-1 rounded-[2px]" style={{ height: n > 0 ? `${Math.max(30, (n / top) * 100)}%` : '12%', background: n > 0 ? color : 'color-mix(in oklab, currentColor 16%, transparent)' }} />
            ))}
          </div>
          <span className="w-8 shrink-0 text-right text-[length:calc(17px*var(--ts))] font-bold tabular-nums">{idt.votes}</span>
        </div>

        {/* The next step, one line, doable here. */}
        <div className="mt-2 flex items-center gap-2 pl-6">
          {idt.next ? (
            <>
              <p className="min-w-0 flex-1 truncate text-[length:calc(13.5px*var(--ts))] text-muted-foreground">Next: <span className="text-foreground">{idt.next.title}</span></p>
              <button onClick={() => onDoNext(idt.next!.id)} className="shrink-0 rounded-full border border-primary/60 px-3 py-0.5 text-[length:calc(12.5px*var(--ts))] font-semibold text-primary hover:bg-primary hover:text-primary-foreground">Done</button>
            </>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[length:calc(13.5px*var(--ts))] text-muted-foreground">{counts.length ? 'Nothing queued' : 'Nothing counts yet'}</p>
          )}
          <button onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-4 border-t border-border/60 pt-3">
            {candidates.length > 0 && !idt.next && (
              <div>
                <p className="mb-1.5 text-[length:calc(12px*var(--ts))] font-medium text-muted-foreground">Does one of these count?</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button key={c.id} onClick={() => onChange({ itemIds: [...idt.itemIds, c.id] })} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/80 px-2.5 py-0.5 text-[length:calc(12.5px*var(--ts))] hover:border-primary hover:bg-primary/10"><Plus className="h-3 w-3 shrink-0 text-primary" /><span className="truncate">{c.title}</span></button>
                  ))}
                </div>
              </div>
            )}
            {idt.recent.length > 0 && (
              <ul className="space-y-1.5">
                {idt.recent.map((r: Receipt, i) => (
                  <li key={`${r.id}-${i}`} className="flex items-baseline gap-2 text-[length:calc(13.5px*var(--ts))]">
                    <span style={{ color }}>✓</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-[length:calc(12px*var(--ts))] text-muted-foreground">{dayLabel(r.date, today)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <div className="mb-1.5 text-[length:calc(12px*var(--ts))] font-medium text-muted-foreground">What counts toward it</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {counts.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] py-0.5 pl-2.5 pr-1 text-[length:calc(12.5px*var(--ts))]">
                    {c.label}
                    <button onClick={c.drop} aria-label={`Stop counting ${c.label}`} title="Stop counting this" className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.1] hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {counts.length === 0 && <span className="text-[length:calc(13px*var(--ts))] text-muted-foreground">Nothing yet.</span>}
              </div>
            </div>
            <PickRow label="Add areas and projects" items={pick.areas.map((l) => ({ key: l.id, label: l.title || 'Untitled', on: idt.listIds.includes(l.id) }))} onToggle={(k) => toggleIn('listIds', k)} />
            <PickRow label="Add to-dos" items={pick.items.map((h) => ({ key: h.id, label: h.title || 'Untitled', on: idt.itemIds.includes(h.id) }))} onToggle={(k) => toggleIn('itemIds', k)} />
            <PickRow label="Add tags" items={pick.tags.map((t) => ({ key: t, label: t, on: idt.tags.some((x) => x.toLowerCase() === t.toLowerCase()) }))} onToggle={(k) => toggleIn('tags', k)} />
            <button onClick={onForget} className="inline-flex items-center gap-1.5 text-[length:calc(13px*var(--ts))] text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Forget this one</button>
          </div>
        )}
      </div>
    </li>
  )
}

function PickRow({ label, items, onToggle }: { label: string; items: { key: number | string; label: string; on: boolean }[]; onToggle: (key: number | string) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 text-[length:calc(12px*var(--ts))] font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button key={it.key} onClick={() => onToggle(it.key)} aria-pressed={it.on} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[length:calc(12.5px*var(--ts))] transition-colors ${it.on ? 'border-primary bg-primary/15 font-medium' : 'border-border/80 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'}`}>{it.label}</button>
        ))}
      </div>
    </div>
  )
}
