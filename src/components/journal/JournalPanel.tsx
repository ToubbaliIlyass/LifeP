'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pencil, PenLine, Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { Markdown } from '@/components/notes/Markdown'
import { MicButton } from '@/components/ui/mic-button'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { notifyDataChanged } from '@/lib/dataSignal'
import { addDays, todayStr } from '@/lib/date'

interface Entry {
  id: number
  date: string
  content: string
  mood: string | null
  createdAt: string
  updatedAt: string
}

type Mood = 'great' | 'good' | 'okay' | 'bad' | 'awful'

/**
 * A five-step ramp, deliberately monotonic: strong green through amber to deep
 * red, so a run of days reads as a gradient rather than five unrelated hues.
 * Both halves of each pair are needed — a mid-weight colour that carries on
 * paper goes muddy against the dark background.
 *
 * Mood is ordinal and has a direction, so the ramp is the encoding; the
 * colour never appears without its name beside it, in the legend under the
 * calendar and in every cell's tooltip.
 */
const MOODS: Array<{ key: Mood; label: string; emoji: string; dot: string }> = [
  { key: 'great', label: 'Great', emoji: '😄', dot: 'bg-emerald-500/85 dark:bg-emerald-400/80' },
  { key: 'good',  label: 'Good',  emoji: '🙂', dot: 'bg-emerald-400/55 dark:bg-emerald-400/45' },
  { key: 'okay',  label: 'Okay',  emoji: '😐', dot: 'bg-amber-400/75 dark:bg-amber-400/65' },
  { key: 'bad',   label: 'Bad',   emoji: '😕', dot: 'bg-rose-400/75 dark:bg-rose-400/65' },
  { key: 'awful', label: 'Awful', emoji: '😞', dot: 'bg-red-600/85 dark:bg-red-500/80' },
]

const MOOD_BY_KEY = new Map(MOODS.map((m) => [m.key as string, m]))

/** Twelve weeks of calendar: a season, and still legible at cell size. */
const CALENDAR_WEEKS = 12

const WEEKDAY_ROWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function formatMonth(key: string): string {
  const d = new Date(key + '-01T00:00:00')
  const now = new Date()
  const label = d.toLocaleDateString('en-US', { month: 'long' })
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`
}

function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const today = todayStr()
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatLongDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** Monday-first row index, so the calendar reads like a wall calendar. */
function rowOf(date: string): number {
  return (new Date(date + 'T00:00:00').getDay() + 6) % 7
}

function words(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export function JournalPanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  const [date, setDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  /**
   * What the user has typed, or null while the composer still shows exactly
   * what the server holds.
   *
   * The composer is derived from the stored entry rather than copied into
   * state on every date change: copying would mean an effect writing state on
   * each render pass, and a background reload landing mid-sentence would
   * overwrite what was being written. Holding the date alongside the text is
   * what makes the fallback safe — edits belong to the day they were typed
   * for, never to whichever day is showing now.
   */
  const [edit, setEdit] = useState<{ date: string; content: string; mood: Mood | null } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/journal')
      const { entries: e } = (await res.json()) as { entries?: Entry[] }
      setEntries(e ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries])
  // Switching dates shows that day's stored entry, so writing twice on one day
  // — or back-dating onto a day the AI already recorded — continues the page
  // rather than starting a second one.
  const existing = byDate.get(date)
  const pending = edit?.date === date ? edit : null
  const draft = pending ? pending.content : existing?.content ?? ''
  const mood = pending ? pending.mood : (existing?.mood as Mood | null) ?? null

  const setDraft = useCallback((content: string) => {
    setEdit((prev) => ({
      date,
      content,
      mood: prev?.date === date ? prev.mood : ((byDate.get(date)?.mood as Mood | null) ?? null),
    }))
  }, [date, byDate])
  function setMood(next: Mood | null) { setEdit({ date, content: draft, mood: next }) }

  /*
   * Dictation, into the page rather than beside it.
   *
   * A journal is the one place in the app where the words are the point, and
   * the gap between having had a day and having written it down is where
   * journalling dies. Speaking it is the shortest route through that gap —
   * so the microphone sits in the corner of the page itself, and what was
   * already written is kept in front of whatever is said next.
   */
  const [kept, setKept] = useState('')
  const draftRef = useRef('')
  useEffect(() => { draftRef.current = draft }, [draft])

  const speech = useSpeechInput(useCallback((spoken: string) => {
    setDraft(kept ? `${kept}\n\n${spoken}` : spoken)
  }, [kept, setDraft]))

  const { listening, reset } = speech
  useEffect(() => {
    if (!listening) return
    setKept(draftRef.current.trim())
    reset()
  }, [listening, reset])

  const shown = listening && speech.mode === 'live'
    ? [kept, speech.transcript].filter(Boolean).join('\n\n')
    : draft

  async function save() {
    const content = draft.trim()
    if (!content || saving) return
    setSaving(true)
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, content, mood }),
    })
    setSaving(false)
    if (!res.ok) return
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1600)
    // Reload first, then drop the local edit: the composer falls back to the
    // stored entry, which is now the text that was just written.
    await load()
    setEdit(null)
    setKept('')
    notifyDataChanged()
  }

  /*
   * Twelve weeks as a calendar rather than a row of bars.
   *
   * The old strip was thirty-five days in a line, which answered "did I write
   * yesterday" and nothing else. Laid out in weeks, the same cells answer the
   * questions a journal actually raises — whether the bad days cluster, which
   * weekday goes quiet, how long the current run is.
   */
  const calendar = useMemo(() => {
    const today = todayStr()
    // Back to the Monday that starts the first week shown, so every column is
    // a whole week and the rows mean what their labels say.
    const start = addDays(today, -(CALENDAR_WEEKS * 7 - 1 - (6 - rowOf(today))))
    return Array.from({ length: CALENDAR_WEEKS }, (_, week) =>
      Array.from({ length: 7 }, (_, row) => {
        const d = addDays(start, week * 7 + row)
        const entry = byDate.get(d)
        return { date: d, mood: entry?.mood ?? null, written: Boolean(entry), future: d > today }
      }),
    )
  }, [byDate])

  const streak = useMemo(() => {
    let n = 0
    for (let d = todayStr(); byDate.has(d); d = addDays(d, -1)) n++
    return n
  }, [byDate])

  // The day being written is shown in full in the composer above; repeating it
  // in the list below would just be the same words twice.
  const needle = query.trim().toLowerCase()
  const past = entries.filter(
    (e) => e.date !== date && (!needle || e.content.toLowerCase().includes(needle) || e.date.includes(needle)),
  )
  const months: Array<[string, Entry[]]> = []
  for (const entry of past) {
    const key = monthKey(entry.date)
    const last = months[months.length - 1]
    if (last && last[0] === key) last[1].push(entry)
    else months.push([key, [entry]])
  }

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); notifyDataChanged(); setSelectedId(null) }}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-4 md:px-6 py-5 space-y-6">

          {/* ── The page being written ─────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <button
                onClick={() => setDate((d) => addDays(d, -1))}
                aria-label="Previous day"
                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h2 className="text-[19px] leading-tight truncate">{formatDay(date)}</h2>
                <p className="text-[11px] text-muted-foreground/55 mt-0.5">
                  {formatLongDay(date)}
                  {existing && <span> · written</span>}
                </p>
              </div>
              <button
                onClick={() => setDate((d) => (d >= todayStr() ? d : addDays(d, 1)))}
                disabled={date >= todayStr()}
                aria-label="Next day"
                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="ml-auto flex items-center gap-1.5">
                {date !== todayStr() && (
                  <button
                    onClick={() => setDate(todayStr())}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground/75 hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    Today
                  </button>
                )}
                <input
                  type="date"
                  value={date}
                  max={todayStr()}
                  onChange={(e) => setDate(e.target.value || todayStr())}
                  className="bg-muted/40 border border-border/40 rounded-lg px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  aria-label="Entry date"
                />
              </div>
            </div>

            {/* The writing surface. Serif, generous, and the only loud thing
                on the screen — everything else is furniture around it. */}
            <div className="relative">
              <textarea
                value={shown}
                onChange={(e) => setDraft(e.target.value)}
                readOnly={listening}
                onKeyDown={(e) => {
                  // Enter has to stay a newline in prose, so saving is the
                  // deliberate chord instead.
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
                }}
                placeholder={
                  speech.transcribing ? 'Writing that down…'
                    : listening ? (speech.mode === 'record' ? 'Recording — press stop when you are done' : 'Listening…')
                    : 'How did the day go?'
                }
                rows={10}
                className="w-full bg-card/60 border border-border/50 rounded-2xl px-4 pt-4 pb-11 text-[14.5px] leading-[1.75] text-foreground/90 placeholder:text-muted-foreground/40 resize-y focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-colors"
              />
              <span className="absolute left-3.5 bottom-3 text-[10px] font-mono text-muted-foreground/40 pointer-events-none">
                {words(shown)} {words(shown) === 1 ? 'word' : 'words'}
                <span className="hidden sm:inline"> · ⌘↵ to save</span>
              </span>
              <span className="absolute right-3 bottom-2.5">
                <MicButton speech={speech} className="w-8 h-8" />
              </span>
            </div>
            {speech.error && <p className="text-[11px] text-destructive mt-1.5">{speech.error}</p>}

            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {MOODS.map((m) => {
                const on = mood === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setMood(on ? null : m.key)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-lg border text-[11.5px] transition-colors ${
                      on
                        ? 'border-primary/45 bg-primary/10 text-foreground'
                        : 'border-border/45 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
                    <span>{m.label}</span>
                  </button>
                )
              })}
              <button
                onClick={save}
                disabled={saving || !draft.trim()}
                className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-35"
              >
                {justSaved && <Check className="w-3.5 h-3.5" />}
                {saving ? 'Saving…' : justSaved ? 'Saved' : existing ? 'Update' : 'Save'}
              </button>
            </div>
          </section>

          {/* ── Twelve weeks at a glance ───────────────────── */}
          <section className="rounded-2xl border border-border/45 bg-muted/15 px-4 py-3.5">
            <div className="flex items-baseline gap-2 mb-2.5">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/55">
                Twelve weeks
              </p>
              {streak > 0 && (
                <p className="text-[11px] text-muted-foreground/60">
                  · {streak} day{streak === 1 ? '' : 's'} in a row
                </p>
              )}
              <p className="ml-auto text-[11px] text-muted-foreground/45">{entries.length} entries</p>
            </div>

            <div className="flex gap-[3px]">
              <div className="flex flex-col gap-[3px] pr-1">
                {WEEKDAY_ROWS.map((d, i) => (
                  <span
                    key={d}
                    className="h-[13px] text-[9px] font-mono leading-[13px] text-muted-foreground/35 w-6 text-right"
                  >
                    {i % 2 === 1 ? d : ''}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px] flex-1">
                {calendar.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px] flex-1">
                    {week.map((day) => {
                      const m = day.mood ? MOOD_BY_KEY.get(day.mood) : null
                      const label = `${formatLongDay(day.date)}${m ? ` · ${m.label}` : day.written ? ' · written' : ' · nothing written'}`
                      return (
                        <button
                          key={day.date}
                          onClick={() => !day.future && setDate(day.date)}
                          disabled={day.future}
                          title={label}
                          aria-label={label}
                          className={`h-[13px] rounded-[3px] transition-all hover:scale-[1.18] disabled:opacity-25 disabled:hover:scale-100 ${
                            m ? m.dot : day.written ? 'bg-muted-foreground/30' : 'bg-muted/70'
                          } ${day.date === date ? 'ring-1 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* The ramp is ordinal, so it gets named — a colour alone never
                says which end of it a day was. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
              {MOODS.map((m) => (
                <span key={m.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                  <span className={`w-2 h-2 rounded-[2px] ${m.dot}`} /> {m.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <span className="w-2 h-2 rounded-[2px] bg-muted-foreground/30" /> No mood
              </span>
            </div>
          </section>

          {/* ── Everything written before ──────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/55">
                Earlier
              </p>
              <div className="ml-auto relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search entries"
                  aria-label="Search entries"
                  className="bg-muted/40 border border-border/40 rounded-lg pl-7 pr-7 py-1.5 text-[12px] w-40 focus:w-56 transition-[width] focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/50 hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {loading && <p className="text-[12px] text-muted-foreground/50 text-center py-8 font-mono">loading…</p>}

            {!loading && past.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground/55 leading-relaxed py-6 text-center">
                {needle
                  ? `Nothing matches “${query.trim()}”.`
                  : entries.length === 0
                    ? 'Nothing written yet. Say or type a line about today above — a sentence counts.'
                    : 'Nothing else written yet. Past entries collect here as the days go by.'}
              </p>
            )}

            {!loading && past.length > 0 && (
              <div className="space-y-5">
                {months.map(([key, group]) => (
                  <div key={key}>
                    <p className="text-[11px] font-medium uppercase tracking-widest mb-2 text-muted-foreground/45">
                      {formatMonth(key)}
                      <span className="font-mono font-normal ml-1.5 opacity-60 text-[10px]">· {group.length}</span>
                    </p>
                    <div className="space-y-2">
                      {group.map((entry) => {
                        const m = entry.mood ? MOOD_BY_KEY.get(entry.mood) : null
                        return (
                          <article
                            key={entry.id}
                            className="group rounded-xl border border-border/45 bg-card/40 hover:bg-card/70 transition-colors overflow-hidden"
                          >
                            <header className="flex items-center gap-2 px-3.5 pt-2.5">
                              {m && <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} title={m.label} />}
                              <span className="text-[11.5px] font-medium text-foreground/70">
                                {formatDay(entry.date)}
                              </span>
                              {m && <span className="text-[11px] text-muted-foreground/50">{m.label}</span>}
                              <div className="ml-auto flex items-center gap-0.5">
                                <button
                                  onClick={() => setDate(entry.date)}
                                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
                                  title="Continue this entry above"
                                >
                                  <PenLine className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setSelectedId(entry.id)}
                                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
                                  title="View, edit or delete"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </header>
                            {entry.content && (
                              <div className="px-3.5 pb-3 pt-1.5 text-[13.5px] leading-relaxed text-foreground/80">
                                <Markdown>{entry.content}</Markdown>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
