'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HeartPulse, Plus, Trophy, TrendingDown, TrendingUp, Minus, X, ChevronDown } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { MetricChart, Sparkline, fmt, type Point } from './MetricChart'
import { notifyDataChanged } from '@/lib/dataSignal'
import { addDays, todayStr } from '@/lib/date'

/**
 * Everything you put a number on, and what it has been doing.
 *
 * The panel used to be a list of collapsible rows with a 72px sparkline in
 * each — enough to say "weight went down a bit", and useless for the two
 * questions people actually keep numbers for: what is the shape of this over
 * months, and what is my best ever. So it is a dashboard now: one series at
 * full size with axes and a hover readout, the rest as thumbnails you switch
 * to, and a row of figures that always includes the record.
 *
 * The record is the whole answer to "keep track of my maxes". A lift is a
 * series where the maximum is the point, and it used to be buried at whatever
 * scroll position that day happened to sit at. It is shown as "highest" and
 * paired with "lowest" rather than called "best", because the panel has no
 * idea which direction is good: up is a personal record on a bench press and
 * bad news on a resting heart rate, and a chart that congratulated you on
 * either would be worse than one that stayed quiet.
 */

interface Metric {
  id: number
  label: string
  value: number | null
  unit: string | null
  date: string
  createdAt: string
}

interface Series {
  /** Lower-cased label — the grouping key and what the card shows. */
  label: string
  /** Newest first, the order the API returns. */
  entries: Metric[]
  unit: string | null
}

const input =
  'bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0'

/*
 * Units you accumulate, as opposed to units you are.
 *
 * A total is the right figure for kilometres run this month and a nonsense
 * one for weight — adding up every time you stood on the scales produces a
 * number with no meaning that still looks like data. There is no way to tell
 * from the values themselves, so it goes on the unit, which is the one place
 * the distinction is actually written down. Anything unrecognised gets no
 * total rather than a wrong one.
 */
const ACCUMULATING = new Set([
  'km', 'kilometre', 'kilometres', 'kilometer', 'kilometers', 'mi', 'mile', 'miles', 'm', 'metres', 'meters',
  'min', 'mins', 'minute', 'minutes', 'h', 'hr', 'hrs', 'hour', 'hours',
  'kcal', 'cal', 'calories', 'steps', 'reps', 'sets', 'l', 'ml', 'litres', 'liters',
])

const RANGES = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '3 months', days: 90 },
  { key: '1y', label: 'A year', days: 365 },
  { key: 'all', label: 'All', days: null },
] as const

type RangeKey = (typeof RANGES)[number]['key']

function shortDate(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Labels are grouped case-insensitively: metrics logged before this panel
 * existed (quick-add, or the assistant) capitalise however the sentence did,
 * and "Weight" and "weight" are one series to the person tracking it.
 */
function toSeries(metrics: Metric[]): Series[] {
  const byLabel = new Map<string, Metric[]>()
  for (const m of metrics) {
    const key = m.label.toLowerCase()
    const list = byLabel.get(key)
    if (list) list.push(m)
    else byLabel.set(key, [m])
  }

  return [...byLabel.entries()]
    .map(([label, entries]) => ({
      label,
      entries,
      // The unit of the most recent entry that carries one, so a series keeps
      // reading in kg even if one stray point was logged without a unit.
      unit: entries.find((e) => e.unit)?.unit ?? null,
    }))
    // Most recently updated series first — what you are currently tracking.
    .sort((a, b) => b.entries[0].date.localeCompare(a.entries[0].date))
}

export function HealthPanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('90d')
  const [tableOpen, setTableOpen] = useState(false)

  const load = useCallback(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(({ metrics: m }: { metrics: Metric[] }) => setMetrics(m))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Quick-add and the assistant both write HealthMetrics from outside this
  // panel; refreshKey is how an already-open tab hears about it.
  useEffect(() => { load() }, [load, refreshKey])

  const series = useMemo(() => toSeries(metrics), [metrics])
  // Whatever was picked, or the one touched most recently — never nothing,
  // so the chart is populated the moment there is anything to draw.
  const active = series.find((s) => s.label === chosen) ?? series[0] ?? null
  const others = series.filter((s) => s.label !== active?.label)

  const stats = useMemo(() => {
    if (!active) return null
    const days = RANGES.find((r) => r.key === range)?.days ?? null
    const from = days === null ? '0000-00-00' : addDays(todayStr(), -days)

    const all = active.entries
      .filter((e) => e.value !== null)
      .map((e) => ({ date: e.date, value: e.value as number }))
    const inRange = all.filter((p) => p.date >= from)
    // Chronological for the chart; the API hands them back newest first.
    const points: Point[] = [...inRange].reverse()

    const values = inRange.map((p) => p.value)
    // Over the whole history, not the visible range: a record is a record
    // whether or not it happened inside the last three months.
    const highest = all.length ? all.reduce((a, b) => (b.value > a.value ? b : a)) : null
    const lowest = all.length ? all.reduce((a, b) => (b.value < a.value ? b : a)) : null
    const [latest, previous] = all
    const delta = latest && previous ? latest.value - previous.value : null

    const accumulates = ACCUMULATING.has((active.unit ?? '').trim().toLowerCase())

    return {
      points,
      latest: latest ?? null,
      delta,
      highest,
      lowest,
      // A record is only news if it happened on the latest entry.
      isRecord: Boolean(
        highest && latest && highest.date === latest.date && all.length > 2 && highest.value === latest.value,
      ),
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      total: accumulates && values.length ? values.reduce((a, b) => a + b, 0) : null,
      count: values.length,
    }
  }, [active, range])

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); notifyDataChanged(); setSelectedId(null) }}
        />
      )}

      <div className="shrink-0 border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">
            Health
            <span className="ml-1.5 opacity-60 text-[10px]">· {series.length} tracked</span>
          </p>
          <button
            onClick={() => setComposerOpen((o) => !o)}
            className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" /> Log
          </button>
        </div>

        {composerOpen && (
          <LogComposer
            series={series}
            initialLabel={active?.label ?? ''}
            onClose={() => setComposerOpen(false)}
            onLogged={(label) => { setChosen(label); load(); notifyDataChanged() }}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>
        )}

        {!loading && series.length === 0 && (
          <div className="pt-12 px-8 text-center">
            <HeartPulse className="w-5 h-5 mx-auto text-muted-foreground/40" />
            <p className="text-[13px] text-foreground/70 mt-3">Nothing measured yet</p>
            <p className="text-[12px] text-muted-foreground/60 mt-2 leading-relaxed max-w-[46ch] mx-auto">
              Log anything you put a number on — your weight, a run, a lift, hours slept.
              Each label builds its own history: a chart over time, the trend, and your
              best ever. Entries keep their own date, so you can back-date what you
              already know.
            </p>
            <button
              onClick={() => setComposerOpen(true)}
              className="mt-4 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40"
            >
              Log the first one
            </button>
          </div>
        )}

        {!loading && active && stats && (
          <div className="p-4 md:p-6 space-y-6">

            {/* ── What you are looking at ─────────────────── */}
            {series.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {series.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setChosen(s.label)}
                    aria-pressed={s.label === active.label}
                    className={`px-2.5 py-1.5 rounded-lg border text-[12px] transition-colors ${
                      s.label === active.label
                        ? 'border-primary/45 bg-primary/10 text-foreground'
                        : 'border-border/45 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <section>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/55">
                    {active.label}
                  </p>
                  <p className="text-[34px] leading-none font-mono tabular-nums text-foreground mt-1.5">
                    {stats.latest ? fmt(stats.latest.value) : '—'}
                    {active.unit && <span className="text-[14px] text-muted-foreground/60 ml-1.5">{active.unit}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground/55 mt-1.5">
                    {stats.latest ? `last logged ${shortDate(stats.latest.date)}` : 'nothing logged'}
                  </p>
                </div>

                <Figure
                  label="Since last"
                  value={stats.delta === null ? '—' : `${stats.delta > 0 ? '+' : ''}${fmt(stats.delta)}`}
                  icon={stats.delta === null || stats.delta === 0 ? Minus : stats.delta > 0 ? TrendingUp : TrendingDown}
                />
                {/* Highest and lowest, rather than "best": up is good for a
                    lift and bad for a resting heart rate, and the panel does
                    not know which of those it is looking at. */}
                <Figure
                  label="Highest"
                  value={stats.highest ? fmt(stats.highest.value) : '—'}
                  hint={stats.highest ? shortDate(stats.highest.date) : undefined}
                  icon={Trophy}
                />
                <Figure
                  label="Lowest"
                  value={stats.lowest ? fmt(stats.lowest.value) : '—'}
                  hint={stats.lowest ? shortDate(stats.lowest.date) : undefined}
                />
                <Figure
                  label="Average"
                  value={stats.average === null ? '—' : fmt(Math.round(stats.average * 100) / 100)}
                  hint={`over ${stats.count} ${stats.count === 1 ? 'entry' : 'entries'}`}
                />
                {stats.total !== null && (
                  <Figure
                    label="Total"
                    value={fmt(Math.round(stats.total * 100) / 100)}
                    hint="in this range"
                  />
                )}

                {stats.isRecord && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/35 text-[11.5px] text-foreground">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                    Highest yet
                  </span>
                )}
              </div>
            </section>

            {/* ── The series over time ────────────────────── */}
            <section className="rounded-2xl border border-border/45 bg-muted/10 px-2 pt-3 pb-1">
              <div className="flex items-center gap-1.5 px-2 mb-1">
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
                  {active.label} over time
                </p>
                <div className="ml-auto flex gap-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      aria-pressed={range === r.key}
                      className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                        range === r.key
                          ? 'bg-muted/70 text-foreground'
                          : 'text-muted-foreground/55 hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <MetricChart points={stats.points} unit={active.unit} />
            </section>

            {/* The numbers themselves, for anyone who would rather read them
                than a line — and the way in to editing or deleting one. */}
            <section>
              <button
                onClick={() => setTableOpen((o) => !o)}
                className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground/55 hover:text-foreground transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${tableOpen ? 'rotate-180' : ''}`} />
                Every {active.label} entry · {active.entries.length}
              </button>
              {tableOpen && (
                <div className="mt-2 rounded-xl border border-border/45 overflow-hidden">
                  {active.entries.map((e, i) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors ${
                        i > 0 ? 'border-t border-border/35' : ''
                      }`}
                      title="View, edit or delete"
                    >
                      <span className="text-[11px] font-mono text-muted-foreground/60 w-24 shrink-0">{e.date}</span>
                      <span className="text-[12.5px] font-mono tabular-nums text-foreground/85">
                        {e.value === null ? '—' : fmt(e.value)}
                      </span>
                      {e.unit && <span className="text-[10px] font-mono text-muted-foreground/50">{e.unit}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ── Everything else being tracked ───────────── */}
            {others.length > 0 && (
              <section>
                <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">
                  Also tracking
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {others.map((s) => {
                    const values = s.entries.map((e) => e.value).filter((v): v is number => v !== null)
                    const best = values.length ? Math.max(...values) : null
                    return (
                      <button
                        key={s.label}
                        onClick={() => setChosen(s.label)}
                        className="rounded-xl border border-border/45 bg-muted/15 hover:bg-muted/35 transition-colors px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-[12.5px] text-foreground/85 truncate flex-1">{s.label}</p>
                          <Sparkline values={[...values].reverse()} />
                        </div>
                        <div className="flex items-baseline gap-3 mt-1.5">
                          <p className="text-[15px] font-mono tabular-nums text-foreground/85">
                            {s.entries[0].value === null ? '—' : fmt(s.entries[0].value)}
                            {s.unit && <span className="text-[10px] text-muted-foreground/60 ml-1">{s.unit}</span>}
                          </p>
                          {best !== null && (
                            <p className="text-[10px] font-mono text-muted-foreground/50">max {fmt(best)}</p>
                          )}
                          <p className="ml-auto text-[10px] font-mono text-muted-foreground/45">
                            {shortDate(s.entries[0].date)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** One figure in the row under the headline: label above, number below. */
function Figure({
  label, value, hint, icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/45">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </p>
      <p className="text-[17px] font-mono tabular-nums text-foreground/85 mt-1">{value}</p>
      {hint && <p className="text-[10px] font-mono text-muted-foreground/45 mt-0.5">{hint}</p>}
    </div>
  )
}

function LogComposer({
  series, initialLabel, onClose, onLogged,
}: { series: Series[]; initialLabel: string; onClose: () => void; onLogged: (label: string) => void }) {
  const [label, setLabel] = useState(initialLabel)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  // Once the unit is typed by hand it stops following the label, otherwise
  // switching label would wipe what was just entered.
  const [unitTouched, setUnitTouched] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const knownUnit = useMemo(
    () => series.find((s) => s.label === label.trim().toLowerCase())?.unit ?? '',
    [series, label],
  )
  // Logging "weight" again should not ask what a weight is measured in again.
  const effectiveUnit = unitTouched ? unit : knownUnit

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim() || !value.trim() || saving) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        value: Number(value),
        unit: effectiveUnit.trim() || undefined,
        date,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Could not log that')
      return
    }
    // The label and unit stay put: logging several days of the same thing in
    // one sitting is the common case, and only the value and date change.
    setValue('')
    onLogged(label.trim().toLowerCase())
  }

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">Log a metric</p>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {series.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {series.slice(0, 8).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => { setLabel(s.label); setUnitTouched(false) }}
              className={`px-2 py-1 rounded-md text-[11.5px] border transition-colors ${
                label.trim().toLowerCase() === s.label
                  ? 'border-primary/45 bg-primary/10 text-foreground'
                  : 'border-border/45 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          list="health-labels"
          placeholder="weight, run, bench…"
          aria-label="What you measured"
          className={input}
        />
        <datalist id="health-labels">
          {series.map((s) => <option key={s.label} value={s.label} />)}
        </datalist>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
          aria-label="Value"
          className={input}
        />
        <input
          value={effectiveUnit}
          onChange={(e) => { setUnitTouched(true); setUnit(e.target.value) }}
          placeholder="kg, km, hrs"
          aria-label="Unit"
          className={input}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={input}
        />
        <button
          type="submit"
          disabled={!label.trim() || !value.trim() || saving}
          className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          {saving ? 'Logging…' : 'Log'}
        </button>
      </form>

      {error && <p className="text-[11px] font-mono text-destructive mt-2">{error}</p>}
    </div>
  )
}
