'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Wand2 } from 'lucide-react'
import { useUndo } from '@/components/undo/UndoProvider'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { MicButton } from '@/components/ui/mic-button'
import { notifyDataChanged } from '@/lib/dataSignal'
import { TYPE_ICONS } from './typeIcons'
import {
  QUICK_TYPES, quickTypesFor, namePlaceholderFor, propertiesFor, secondaryFieldFor, type QuickType,
} from '@/lib/quick-add'
import { localeIsDayFirst, parseCapture, stripTypeWord } from '@/lib/natural-capture'

/**
 * Capture, inline at the top of Today.
 *
 * The floating button is `md:hidden` — reasonably, since a circle hovering
 * over the content is a phone idiom — which left a laptop with no way to
 * write something down that did not involve opening the chat and waiting for
 * a model. This is the keyboard path: click, type, Enter.
 *
 * It opens rather than sitting open. Idle it is one quiet line, because it
 * sits above the actual day and must not compete with it; focused it becomes
 * a composer with the types and the one extra field worth asking for. The
 * first version crammed all of that onto a single row, which meant a native
 * select and a bare date box wedged between the text and the buttons — every
 * control fighting for the same 40 pixels.
 *
 * There is no "part of" picker on purpose: the assistant connects what it
 * recognises on its own (src/lib/ai/suggest-links.ts), and stopping to file
 * something is exactly what quick capture is for avoiding.
 *
 * Most of the controls below are a fallback rather than the main path: the
 * line itself is read for a type and a date as it is typed, so "task call
 * the dentist tomorrow" needs no chip and no date box. See
 * src/lib/natural-capture.ts — plain string matching, no model, because this
 * runs on every keystroke and a wrong guess must be one word to delete.
 */
export function QuickCapture({ onAdded }: { onAdded?: () => void }) {
  // Only the types this user's modules actually have. A capture sheet
  // offering "Exam" to someone with school switched off is the module
  // leaking through the one screen they use most.
  const [types, setTypes] = useState(QUICK_TYPES)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTypes(quickTypesFor(d)))
      .catch(() => {})
  }, [])
  const [name, setName] = useState('')
  // What the chips and the date box are set to *by hand*. The line being
  // typed wins over both when it says something — see `type`/`secondary`.
  const [pickedType, setPickedType] = useState<QuickType>('Task')
  const [pickedSecondary, setPickedSecondary] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { record } = useUndo()
  // Dictation writes straight into the field as the words arrive, so what is
  // heard is visible and correctable before anything is saved — and it goes
  // through the same parsing, so "task call mum tomorrow" works spoken too.
  const speech = useSpeechInput((text) => setName(text))

  // Read once: it only depends on the browser's locale, and it decides how
  // "5/9" is read, which nothing else can settle.
  const dayFirst = useMemo(() => localeIsDayFirst(), [])
  const parsed = useMemo(
    () => parseCapture(name, { dayFirst, forType: pickedType }),
    [name, dayFirst, pickedType],
  )

  const type = parsed.type ?? pickedType
  const fromText = parsed.date ?? parsed.frequency ?? (parsed.value !== null ? String(parsed.value) : null)
  const secondary = fromText ?? pickedSecondary
  const title = parsed.title

  const field = secondaryFieldFor(type)
  const ready = title.length > 0

  /*
   * One rule for both controls: setting something by hand takes the words
   * that were setting it out of the line. Without that, the parse would keep
   * re-applying on the next keystroke and the chip you just pressed would
   * appear not to work.
   */
  function pickType(next: QuickType) {
    setPickedType(next)
    setPickedSecondary('')
    if (parsed.type) setName(stripTypeWord(name).trimStart())
  }

  function pickSecondary(next: string) {
    setPickedSecondary(next)
    if (fromText === null) return
    const phrase = parsed.matched.find((m) => m.field !== 'type')
    if (phrase) setName(name.replace(phrase.text, ' ').replace(/\s+/g, ' ').trim())
  }
  // Stays open while there is something in it, so it cannot swallow a
  // half-written thought by collapsing when focus moves to the mic.
  const open = focused || ready || speech.listening || speech.transcribing
  const Icon = TYPE_ICONS[type]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title
    if (!trimmed || submitting) return
    setSubmitting(true)

    const res = await fetch('/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, properties: propertiesFor(type, trimmed, secondary) }),
    })
    const created = (await res.json().catch(() => null)) as { node?: { id: number } } | null
    setSubmitting(false)
    if (!created?.node?.id) return // the field keeps what was typed, to retry

    const id = created.node.id
    record(`Added "${trimmed}"`, async () => {
      await fetch(`/api/nodes/${id}`, { method: 'DELETE' })
      onAdded?.()
      notifyDataChanged()
    })

    setName('')
    setPickedSecondary('')
    speech.reset()
    // Focus stays put: capturing one thing usually means capturing three.
    inputRef.current?.focus()
    onAdded?.()
    notifyDataChanged()
  }

  /** "Tue 16 Sep" — a date is easier to sanity-check with its weekday on it. */
  function readableDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (name) { setName(''); speech.reset() }
    else inputRef.current?.blur()
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      // Focus within the whole card counts as focus, so clicking a type chip
      // or the date box does not collapse the thing being filled in.
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }}
      className={`mb-7 rounded-xl border overflow-hidden transition-colors ${
        open ? 'border-primary/35 bg-primary/[0.04]' : 'border-border/50 bg-muted/20 hover:bg-muted/30'
      }`}
    >
      {/*
        Three rows on one rhythm: the same left inset throughout, the same
        vertical padding, and a hairline between each. Anything ending in an
        icon button gets a smaller right inset, so the button's own bounds
        provide that edge rather than doubling up on it.
      */}
      <div className="flex items-center gap-2.5 pl-3.5 pr-2 py-2">
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${open ? 'text-primary/80' : 'text-muted-foreground/40'}`} />
        <input
          ref={inputRef}
          value={speech.listening && speech.mode === 'live' ? speech.transcript : name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            speech.transcribing ? 'Writing that down…'
              : speech.listening ? (speech.mode === 'record' ? 'Recording…' : 'Listening…')
              : open ? namePlaceholderFor(type)
              : 'Capture a task, note or idea…'
          }
          className="flex-1 min-w-0 bg-transparent text-[14px] text-foreground/90 placeholder:text-muted-foreground/45 focus:outline-none"
        />
        <MicButton speech={speech} className="w-7 h-7" />
      </div>

      {open && (
        <>
          {/*
            Whatever the line was read to mean, said back. The controls below
            show it too, but only this says what the *title* will be — and
            the title is the one thing the typing silently changes.
          */}
          {parsed.matched.length > 0 && (
            <p className="flex items-center gap-1.5 px-3.5 pb-2 -mt-0.5 text-[11px] font-mono text-muted-foreground/55">
              <Wand2 className="w-3 h-3 shrink-0 text-primary/60" />
              <span className="truncate">
                <span className="text-foreground/75">{title || '…'}</span>
                {parsed.date && <> · {readableDate(parsed.date)}</>}
                {parsed.frequency && <> · {parsed.frequency}</>}
                {parsed.value !== null && <> · {parsed.value}</>}
              </span>
            </p>
          )}

          <div className="border-t border-border/30" />

          <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5">
            {types.map((t) => {
              const ChipIcon = TYPE_ICONS[t.id]
              const active = type === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickType(t.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border/40 text-muted-foreground/65 hover:text-foreground hover:border-border/70 hover:bg-muted/40'
                  }`}
                >
                  <ChipIcon className="w-3 h-3" />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="border-t border-border/30" />

          {/*
            One line, all of it. The field's label sits beside it rather than
            stacked above: stacked made this side two lines tall while the
            button stayed one, and nothing in the row lined up.
          */}
          <div className="flex items-center gap-2 pl-3.5 pr-2 py-2">
            {field && (
              <>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/55 shrink-0">
                  {field.label}
                </span>
                {field.type === 'select' ? (
                  <select
                    value={secondary || field.options?.[0] || ''}
                    onChange={(e) => pickSecondary(e.target.value)}
                    aria-label={field.label}
                    className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1 text-[12px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={secondary}
                    onChange={(e) => pickSecondary(e.target.value)}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                    className="w-[8.5rem] bg-muted/40 border border-border/40 rounded-lg px-2 py-1 text-[12px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                )}
              </>
            )}

            <span className="flex-1" />

            <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/40">esc to clear</span>
            <button
              type="submit"
              disabled={!ready || submitting}
              className="shrink-0 flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {submitting ? 'Adding…' : 'Add'}
              <CornerDownLeft className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </>
      )}

      {speech.error && (
        <p className="text-[11px] text-destructive px-3.5 pb-2.5 pt-0.5">{speech.error}</p>
      )}
    </form>
  )
}
