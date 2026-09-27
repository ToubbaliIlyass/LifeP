'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Layers, ExternalLink } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import {
  CONTENT_STAGES, CONTENT_PLATFORMS, CONTENT_FORMATS, STAGE_LABELS, type ContentStage,
} from '@/lib/content'

interface Series {
  id: number
  name: string
  description: string | null
  platform: string | null
  status: string
  frequency: string | null
  daysOfWeek: number[] | null
  pieceCount: number
  publishedCount: number
  nextEpisode: number
  nextDue: string | null
}

interface Piece {
  id: number
  title: string
  stage: ContentStage
  platform: string | null
  format: string | null
  seriesId: number | null
  episode: number | null
  publishDate: string | null
  publishTime: string | null
  url: string | null
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const input =
  'bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0'

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function ContentPanel({ refreshKey }: { refreshKey?: number }) {
  const [series, setSeries] = useState<Series[]>([])
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | number>('all')
  const [composer, setComposer] = useState<null | 'piece' | 'series'>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/content')
      .then((r) => r.json())
      .then((d: { series: Series[]; pieces: Piece[] }) => {
        setSeries(d.series)
        setPieces(d.pieces)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const visible = useMemo(
    () => (filter === 'all' ? pieces : pieces.filter((p) => p.seriesId === filter)),
    [pieces, filter],
  )
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series])

  async function move(piece: Piece, step: -1 | 1) {
    const next = CONTENT_STAGES[CONTENT_STAGES.indexOf(piece.stage) + step]
    if (!next) return
    // Optimistic: a card that lags a round trip behind the click feels broken.
    setPieces((all) => all.map((p) => (p.id === piece.id ? { ...p, stage: next } : p)))
    await fetch('/api/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: piece.id, stage: next }),
    })
    load()
  }

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); setSelectedId(null) }}
        />
      )}

      {/* Series strip */}
      <div className="shrink-0 border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              filter === 'all' ? 'bg-foreground text-background border-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            All · {pieces.length}
          </button>
          {series.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              title={s.description ?? undefined}
              className={`shrink-0 text-left px-3 py-1.5 rounded-lg border transition-colors ${
                filter === s.id ? 'bg-foreground text-background border-foreground' : 'border-border/60 hover:bg-muted/40'
              }`}
            >
              <span className="block text-[12px] font-medium leading-tight">{s.name}</span>
              <span className={`block text-[10px] font-mono leading-tight ${filter === s.id ? 'opacity-70' : 'text-muted-foreground/70'}`}>
                ep {s.nextEpisode} next{s.nextDue ? ` · due ${shortDate(s.nextDue)}` : ''}
              </span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 shrink-0 pl-2">
            <button
              onClick={() => setComposer(composer === 'series' ? null : 'series')}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40"
            >
              <Layers className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Series</span>
            </button>
            <button
              onClick={() => setComposer(composer === 'piece' ? null : 'piece')}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" /> Piece
            </button>
          </div>
        </div>

        {composer === 'piece' && (
          <PieceComposer
            series={series}
            defaultSeriesId={filter === 'all' ? null : filter}
            onClose={() => setComposer(null)}
            onCreated={() => { setComposer(null); load() }}
          />
        )}
        {composer === 'series' && (
          <SeriesComposer onClose={() => setComposer(null)} onCreated={() => { setComposer(null); load() }} />
        )}
      </div>

      {/* Pipeline — columns scroll sideways and snap on a phone */}
      {loading ? (
        <p className="text-[12px] font-mono text-muted-foreground/60 text-center pt-10">loading…</p>
      ) : (
        <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 md:px-6 py-4">
          {CONTENT_STAGES.map((stage) => {
            const cards = visible.filter((p) => p.stage === stage)
            return (
              <section key={stage} className="snap-start shrink-0 w-[78vw] sm:w-[250px] flex flex-col min-h-0 rounded-xl bg-muted/20 border border-border/40">
                <header className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">{STAGE_LABELS[stage]}</p>
                  <span className="text-[10px] font-mono text-muted-foreground/60">{cards.length}</span>
                </header>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/45 text-center py-4">
                      {stage === 'idea' ? 'Tell the assistant an idea, or add one.' : 'Nothing here'}
                    </p>
                  )}
                  {cards.map((p) => {
                    const s = p.seriesId ? seriesById.get(p.seriesId) : undefined
                    const i = CONTENT_STAGES.indexOf(p.stage)
                    return (
                      <article key={p.id} className="group rounded-lg bg-card border border-border/60 px-3 py-2.5 shadow-sm">
                        <button onClick={() => setSelectedId(p.id)} className="block w-full text-left">
                          <p className="text-[13px] text-foreground/90 leading-snug">{p.title}</p>
                          <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 flex flex-wrap gap-x-2">
                            {s && <span>{s.name}{p.episode ? ` · ep ${p.episode}` : ''}</span>}
                            {(p.platform ?? s?.platform) && <span>{p.platform ?? s?.platform}</span>}
                            {p.format && <span>{p.format}</span>}
                            {p.publishDate && <span>{shortDate(p.publishDate)}{p.publishTime ? ` ${p.publishTime}` : ''}</span>}
                          </p>
                        </button>
                        <div className="flex items-center justify-between mt-2">
                          <button
                            onClick={() => move(p, -1)}
                            disabled={i === 0}
                            aria-label="Move back a stage"
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          {p.url && (
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open published link">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            onClick={() => move(p, 1)}
                            disabled={i === CONTENT_STAGES.length - 1}
                            aria-label="Move forward a stage"
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-20"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ComposerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">{title}</p>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

function PieceComposer({
  series, defaultSeriesId, onClose, onCreated,
}: { series: Series[]; defaultSeriesId: number | null; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [seriesId, setSeriesId] = useState<number | null>(defaultSeriesId)
  const [platform, setPlatform] = useState('')
  const [format, setFormat] = useState('')
  const [publishDate, setPublishDate] = useState('')
  const [saving, setSaving] = useState(false)
  const chosen = series.find((s) => s.id === seriesId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'piece',
        title,
        seriesId,
        // A piece in a series inherits its platform and takes the next number,
        // which is the whole point of tracking series at all.
        episode: chosen ? chosen.nextEpisode : undefined,
        platform: platform || chosen?.platform || undefined,
        format: format || undefined,
        publishDate: publishDate || undefined,
      }),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <ComposerShell title="New piece" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title or idea" className={`${input} sm:col-span-2`} />
        <select value={seriesId ?? ''} onChange={(e) => setSeriesId(e.target.value ? Number(e.target.value) : null)} className={input}>
          <option value="">No series</option>
          {series.map((s) => <option key={s.id} value={s.id}>{s.name} (ep {s.nextEpisode})</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
          <option value="">{chosen?.platform ? `Platform: ${chosen.platform}` : 'Platform'}</option>
          {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)} className={input}>
          <option value="">Format</option>
          {CONTENT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className={input} aria-label="Publish date" />
        <button type="submit" disabled={!title.trim() || saving} className="sm:col-span-2 lg:col-span-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
          {saving ? 'Adding…' : 'Add as idea'}
        </button>
      </form>
    </ComposerShell>
  )
}

function SeriesComposer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('')
  const [frequency, setFrequency] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'series',
        name,
        platform: platform || undefined,
        frequency: frequency || undefined,
        daysOfWeek: frequency === 'weekly' ? days : frequency === 'weekdays' ? [1, 2, 3, 4, 5] : undefined,
        description: description || undefined,
      }),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <ComposerShell title="New series" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Series name" className={input} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
          <option value="">Platform</option>
          {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={input}>
          <option value="">No fixed cadence</option>
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Weekly on…</option>
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it's about (optional)" className={input} />
        {frequency === 'weekly' && (
          <div className="flex gap-1 sm:col-span-2 lg:col-span-4">
            {DOW.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
                className={`w-8 h-8 rounded-lg text-[12px] font-mono border ${days.includes(i) ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border/50 text-muted-foreground'}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <button type="submit" disabled={!name.trim() || saving || (frequency === 'weekly' && days.length === 0)} className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
          {saving ? 'Creating…' : 'Create series'}
        </button>
      </form>
    </ComposerShell>
  )
}
