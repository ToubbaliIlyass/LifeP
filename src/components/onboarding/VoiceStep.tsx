'use client'

import { toastError } from '@/lib/toast'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Check, Mic, Square, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { BTN_GHOST, BTN_PRIMARY } from '@/components/ui/buttons'
import { clockZone } from '@/lib/wallclock'
import { useSpeechInput } from '@/lib/useSpeechInput'
import type { Step } from '@/lib/onboarding-speech'
import type { TuckState } from '@/lib/tuck/states'

/**
 * One setup question, answered by talking.
 *
 * Tuck asks, one big button listens, and what was understood appears as a
 * short list underneath. Each thing said afterwards goes to the same list —
 * "and I have a lab on Thursday", "make the lecture 11", "forget the gym" —
 * so there is no field to find and nothing to edit by hand; the ✕ on a row
 * is only a quicker way to say "forget that". Typing is there for the browser
 * that cannot listen and for anyone who would rather.
 */
export function VoiceStep<T>({ step, ask, example, items, onItems, row, action, extra, tuck = 'idle' }: {
  step: Step
  ask: string
  example: string
  items: T[]
  onItems: (next: T[]) => void
  row: (item: T) => ReactNode
  /** Something to tap instead of speaking, shown before anything has been said. */
  extra?: ReactNode
  /** The way on: sits right under what was said, centred, so the eye never has to cross the screen. */
  action: ReactNode
  tuck?: TuckState
}) {
  const heard = useRef('')
  const speech = useSpeechInput((t) => { heard.current = t })
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shownError = error ?? speech.error
  useEffect(() => { if (shownError) toastError('I couldn’t get that', shownError, 'acture-voice') }, [shownError])
  const [draft, setDraft] = useState('')
  /** What was just understood, held for a yes before it joins the list: what was said, and the list it would make. */
  const [pending, setPending] = useState<{ said: string; next: T[] } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const wasLive = useRef(false)
  const live = speech.listening || speech.transcribing
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  async function read(text: string) {
    setReading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/hear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, text, current: itemsRef.current, tz: clockZone() }),
      })
      const data = (await res.json().catch(() => ({}))) as { items?: T[]; error?: string }
      if (!res.ok || !data.items) setError(data.error ?? 'I couldn’t read that. Try again.')
      else if (data.items.length === 0 && itemsRef.current.length === 0) setError(`I didn’t catch it. Try “${example}”.`)
      else if (JSON.stringify(data.items) === JSON.stringify(itemsRef.current)) setError('That didn’t change anything. Say what to add, change or forget.')
      else setPending({ said: text, next: data.items })
    } catch {
      setError('I couldn’t reach the assistant. Check your connection and try again.')
    }
    setReading(false)
  }

  // Listening ended with words: read them.
  useEffect(() => {
    if (wasLive.current && !live) {
      const text = (heard.current || speech.transcript).trim()
      if (text) void read(text)
    }
    wasLive.current = live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  const send = () => {
    const t = draft.trim()
    if (!t || reading) return
    setDraft('')
    void read(t)
  }

  // The box grows with what is written, so every line stays in view (up to a quarter of the screen).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, Math.max(96, window.innerHeight * 0.25))}px`
  }, [draft, live])

  const press = () => {
    setPending(null)
    if (live) { speech.stop(); return }
    heard.current = ''
    speech.reset()
    setError(null)
    speech.start()
  }

  const state: TuckState = speech.transcribing || reading ? 'thinking' : speech.listening ? 'listening' : tuck
  const line = speech.listening ? 'I’m listening.'
    : speech.transcribing || reading ? 'Writing that down…'
    : pending ? 'Does this look right?'
    : items.length ? 'Anything to add or change?'
    : ask

  const keyOf = (x: T) => JSON.stringify(x)
  const have = new Set(items.map(keyOf))
  const next = new Set((pending?.next ?? []).map(keyOf))

  const accept = () => { if (pending) { onItems(pending.next); setPending(null) } }
  /** Say it again (or, where nothing can listen, back into the box to fix the words). */
  const again = () => { if (speech.supported) { setPending(null); press() } else if (pending) { setDraft(pending.said); setPending(null); setTimeout(() => box.current?.focus(), 0) } }

  const micButton = !live && !pending && speech.supported && (
    <button
      onClick={press}
      disabled={reading}
      aria-label="Start talking"
      className={`${items.length ? BTN_GHOST : BTN_PRIMARY} mt-[clamp(10px,2.4dvh,20px)] w-full max-w-[420px] shrink-0 ${items.length ? '' : '!h-14 !text-[length:calc(17px*var(--ts))] shadow-md'}`}
    >
      <Mic className="h-5 w-5" /> {reading ? 'One moment…' : items.length ? 'Say more' : 'Tap and talk'}
    </button>
  )

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col items-center justify-center text-center">
      <Tuck state={state} size={300} decorative className={`!w-auto max-w-full shrink-0 aspect-[320/300] ${pending || live ? '!h-[clamp(72px,19dvh,240px)] lg:!h-[clamp(96px,24dvh,320px)]' : items.length ? '!h-[clamp(88px,22dvh,240px)]' : '!h-[clamp(96px,30dvh,380px)] md:!h-[clamp(140px,36dvh,460px)] lg:!h-[clamp(140px,40dvh,540px)]'}`} />
      <p aria-live="polite" className="mt-1 max-w-[24ch] shrink-0 text-[clamp(20px,4dvh,30px)] font-bold leading-tight tracking-tight">{line}</p>
      {items.length === 0 && !live && !reading && !pending && (
        <p className="mt-2 max-w-[44ch] shrink-0 text-[clamp(13px,2.1dvh,15px)] italic leading-snug text-muted-foreground">“{example}”</p>
      )}

      {/* Talking is the whole interaction. While it listens, the same card as the assistant island shows the words as they come. */}
      {live && !pending && (
        <div className="mt-[clamp(10px,2.4dvh,22px)] w-full shrink-0 rounded-2xl border border-border/70 bg-card text-left shadow-[0_2px_12px_oklch(0_0_0/0.06)]">
          <div className="px-4 py-3.5">
            {!speech.transcribing && (
              <div className="mb-1 flex h-6 items-center gap-[3px]" aria-hidden>
                {[10, 20, 14, 24, 11, 22, 16, 24, 13, 18, 10, 21].map((h, i) => (
                  <span key={i} className="acture-voice-bar block w-[3px] rounded-full bg-primary/80" style={{ height: h, animationDelay: `${(i % 5) * 0.12}s` }} />
                ))}
              </div>
            )}
            <p className="max-h-[22dvh] overflow-y-auto whitespace-pre-wrap break-words text-[length:calc(15px*var(--ts))] leading-relaxed text-foreground/85">
              {speech.transcribing ? 'Writing that down…' : speech.transcript || (speech.mode === 'record' ? 'Recording. Tap Done when you have said it all.' : 'Go ahead…')}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => speech.stop()} disabled={speech.transcribing} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[length:calc(13px*var(--ts))] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Square className="h-3.5 w-3.5" fill="currentColor" /> Done
              </button>
              <button onClick={() => speech.cancel()} disabled={speech.transcribing} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[length:calc(13px*var(--ts))] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {extra && items.length === 0 && !live && !reading && !pending && <div className="mt-3 w-full">{extra}</div>}

      {items.length === 0 && micButton}

      {/* Only where the browser cannot listen at all: the one way through, so nobody is stuck. */}
      {(!speech.supported || !!speech.error) && !pending && (
        <form onSubmit={(e) => { e.preventDefault(); send() }} className={`mt-[clamp(10px,2.4dvh,22px)] flex w-full shrink-0 items-end gap-1 rounded-2xl border border-border/70 bg-card py-1.5 pl-3 pr-1.5 ${reading ? 'opacity-60' : ''}`}>
          <textarea
            ref={box}
            value={draft}
            rows={1}
            disabled={reading}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            enterKeyHint="send"
            placeholder="Type it here"
            aria-label="Type your answer"
            className="min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-[length:calc(16px*var(--ts))] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button type="submit" disabled={!draft.trim() || reading} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30">
            <ArrowUp className="h-[18px] w-[18px]" />
          </button>
        </form>
      )}


      {/* Before it counts: what was said, and what came of it. */}
      {pending && (
        <section aria-label="Preview" className="mt-3 flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.06] text-left">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-[length:calc(11.5px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">You said</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[length:calc(14.5px*var(--ts))] leading-snug text-foreground/90">“{pending.said}”</p>
            <p className="mt-3 text-[length:calc(11.5px*var(--ts))] font-semibold uppercase tracking-wider text-muted-foreground">I got</p>
            <ul className="mt-1.5 space-y-1.5">
              {pending.next.map((it) => (
                <li key={keyOf(it)} className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-1.5 text-[length:calc(14.5px*var(--ts))]">
                  <div className="min-w-0 flex-1">{row(it)}</div>
                  {items.length > 0 && !have.has(keyOf(it)) && <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[length:calc(11px*var(--ts))] font-semibold text-primary">New</span>}
                </li>
              ))}
              {items.filter((it) => !next.has(keyOf(it))).map((it) => (
                <li key={`gone-${keyOf(it)}`} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[length:calc(14px*var(--ts))] text-muted-foreground line-through">
                  <div className="min-w-0 flex-1">{row(it)}</div>
                  <span className="shrink-0 text-[length:calc(11px*var(--ts))] no-underline">Removed</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-primary/20 px-3 py-2.5">
            <button onClick={accept} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[length:calc(13.5px*var(--ts))] font-semibold text-primary-foreground hover:opacity-90"><Check className="h-4 w-4" /> Looks right</button>
            <button onClick={again} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[length:calc(13.5px*var(--ts))] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"><Mic className="h-3.5 w-3.5" /> {speech.supported ? 'Say it again' : 'Edit'}</button>
            <button onClick={() => setPending(null)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[length:calc(13.5px*var(--ts))] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"><X className="h-3.5 w-3.5" /> Discard</button>
            <span className="ml-auto text-[length:calc(11.5px*var(--ts))] text-muted-foreground max-sm:hidden">Saved when you finish setup</span>
          </div>
        </section>
      )}

      {/* What is already kept: short rows, no box around them. */}
      {!pending && items.length > 0 && (
        <ul aria-label="What I have" className="mt-[clamp(10px,2.4dvh,20px)] min-h-0 w-full max-w-[420px] divide-y divide-border/60 overflow-y-auto rounded-2xl border border-border/70 bg-foreground/[0.025] text-left">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-1.5 pl-3.5 pr-1.5 text-[clamp(13.5px,2.3dvh,15.5px)]">
              <div className="min-w-0 flex-1">{row(it)}</div>
              <button onClick={() => onItems(items.filter((_, j) => j !== i))} aria-label="Forget this one" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-destructive"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && micButton}

      {!pending && <div className="mt-[clamp(10px,2.4dvh,22px)] flex w-full max-w-[420px] shrink-0 flex-col items-center gap-2">{action}</div>}
    </div>
  )
}
