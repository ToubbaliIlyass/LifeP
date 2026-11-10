'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Check, Keyboard, Mic, Square, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import type { TuckState } from '@/lib/tuck/states'

export type TellTuckPhase = 'listening' | 'working' | 'reply'

/**
 * Tell Tuck, as one full-screen conversation.
 *
 * You press the button and Tuck takes the screen. While you talk, the words
 * come up as you say them. When you are done, Tuck works (and says what it is
 * doing), then tells you what changed in a sentence or two, with the changes
 * themselves as cards under it: a plan to look over, moves to untick, what was
 * added. A big mic under it carries on the conversation; Done goes back to the
 * app. It is the same screen from start to finish, so there is no jump from
 * full screen to a small box just when the interesting part begins.
 *
 * Drawn into the body: the island it was started from is transformed, and a
 * fixed child of that would be fixed to the island.
 */
export function TellTuckScreen({ phase, tuck, line, words, said, busy, transcribing, onStop, onCancel, onMore, onClose, onType, error, children }: {
  phase: TellTuckPhase
  tuck: TuckState
  /** What Tuck says while listening or working, when there are no words yet. */
  line: string
  /** What has been heard so far, while listening. */
  words: string
  /** What the user just said, kept above the answer. */
  said: string
  /** Waiting on the assistant. */
  busy: boolean
  /** Turning the recording into text. */
  transcribing: boolean
  onStop: () => void
  onCancel: () => void
  onMore: () => void
  onClose: () => void
  /** Carry on by typing instead. */
  onType: (text: string) => void
  /** The microphone or the speech service failed: say so, and open the keyboard so nobody is stuck. */
  error?: string | null
  /** The answer and its cards, in the reply phase. */
  children?: ReactNode
}) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  // New content comes in under the eye: the answer is read from the top, the cards below it.
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }) }, [phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (phase === 'listening') onCancel(); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onCancel, onClose])

  if (typeof document === 'undefined') return null
  const reply = phase === 'reply'
  // A failed microphone opens the keyboard by itself, so nobody is stuck.
  const typingNow = typing || (!!error && phase === 'listening')

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Tell Tuck" className="fixed inset-0 z-[70] flex flex-col bg-background/95 text-foreground backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex shrink-0 justify-end px-4 pt-4">
        <button onClick={phase === 'listening' ? onCancel : onClose} aria-label="Close (Esc)" title="Close (Esc)" className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.08] text-muted-foreground hover:bg-foreground/[0.12] hover:text-foreground"><X className="h-5 w-5" /></button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-[clamp(8px,2dvh,20px)] pb-6 text-center">
          <Tuck state={tuck} size={400} decorative className={`!w-auto max-w-[80vw] aspect-[320/300] shrink-0 ${reply ? '!h-[clamp(96px,22dvh,220px)]' : '!h-[clamp(120px,34dvh,400px)]'}`} />

          {phase === 'listening' && (
            <>
              {!transcribing && (
                <div className="flex h-8 items-center gap-1" aria-hidden>
                  {[10, 22, 16, 30, 12, 26, 18, 30, 14, 22, 11, 25, 16].map((h, i) => (
                    <span key={i} className="acture-voice-bar block w-1 rounded-full bg-primary/80" style={{ height: h, animationDelay: `${(i % 5) * 0.12}s` }} />
                  ))}
                </div>
              )}
              <p aria-live="polite" className="max-h-[28dvh] max-w-[34ch] overflow-y-auto whitespace-pre-wrap break-words text-[clamp(18px,3.4dvh,28px)] font-semibold leading-snug tracking-tight">
                {transcribing ? 'Writing that down…' : words || line}
              </p>
            </>
          )}

          {phase === 'working' && (
            <>
              {said && <p className="max-w-[40ch] text-[length:calc(15px*var(--ts))] italic text-muted-foreground">“{said}”</p>}
              <p aria-live="polite" className="text-[clamp(18px,3.2dvh,26px)] font-semibold leading-snug tracking-tight">{line}</p>
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
              </div>
              {/* Cards that have already arrived stay in view while the rest is worked out. */}
              {children}
            </>
          )}

          {reply && (
            <>
              {said && <p className="max-w-[44ch] text-[length:calc(14px*var(--ts))] italic text-muted-foreground">“{said}”</p>}
              <div className="w-full space-y-3 text-left">{children}</div>
            </>
          )}
        </div>
      </div>

      {/* The way to carry on: always under the content, never over it. */}
      <div className="shrink-0 border-t border-border/50 px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        <div className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-2">
          {error && phase === 'listening' && (
            <p role="alert" className="max-w-[44ch] text-center text-[length:calc(15px*var(--ts))] text-destructive">
              {/denied|permission|allow|not-allowed/i.test(error) ? 'I can’t use the microphone. Allow it in your browser, or type instead.' : 'I couldn’t hear you. Try again, or type instead.'}
            </p>
          )}
          {phase === 'listening' && !typingNow && (
            <div className="flex items-center gap-3">
              <button onClick={onStop} disabled={transcribing} className="flex h-14 items-center gap-2.5 rounded-full bg-primary px-8 text-[length:calc(17px*var(--ts))] font-bold text-primary-foreground shadow-lg transition motion-safe:hover:scale-105 active:scale-95 disabled:opacity-50"><Square className="h-4 w-4" fill="currentColor" /> Done</button>
              <button onClick={onCancel} disabled={transcribing} className="flex h-14 items-center gap-2 rounded-full px-5 text-[length:calc(15px*var(--ts))] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"><X className="h-4 w-4" /> Cancel</button>
              <button onClick={() => setTyping(true)} aria-label="Type instead" title="Type instead" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Keyboard className="h-5 w-5" /></button>
            </div>
          )}
          {phase === 'working' && <p className="text-[length:calc(13px*var(--ts))] text-muted-foreground">{busy ? 'One moment…' : ''}</p>}
          {reply && !typingNow && (
            <div className="flex items-center gap-3">
              <button onClick={onMore} className="flex h-14 items-center gap-2.5 rounded-full bg-primary px-7 text-[length:calc(16px*var(--ts))] font-bold text-primary-foreground shadow-lg transition motion-safe:hover:scale-105 active:scale-95"><Mic className="h-5 w-5" /> <span>Tell Tuck<span className="max-sm:hidden"> more</span></span></button>
              <button onClick={onClose} className="flex h-14 items-center gap-2 rounded-full px-5 text-[length:calc(15px*var(--ts))] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Check className="h-4 w-4" /> Done</button>
              <button onClick={() => setTyping(true)} aria-label="Type instead" title="Type instead" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Keyboard className="h-4.5 w-4.5" /></button>
            </div>
          )}
          {(reply || phase === 'listening') && typingNow && (
            <form onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (t) { setDraft(''); setTyping(false); onType(t) } }} className="flex w-full items-center gap-2">
              <div className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-foreground/[0.06] pl-4 pr-1.5 focus-within:ring-1 focus-within:ring-primary">
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say more…" aria-label="Type to Tuck" className="min-w-0 flex-1 bg-transparent text-[length:calc(16px*var(--ts))] outline-none placeholder:text-muted-foreground/70" />
                <button type="submit" disabled={!draft.trim()} aria-label="Send" className="grid h-9 w-9 max-md:h-11 max-md:w-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-30"><ArrowUp className="h-[18px] w-[18px]" /></button>
              </div>
              <button type="button" onClick={() => { setTyping(false); if (error) onCancel() }} className="rounded-full px-3 py-2 max-md:min-h-11 text-[length:calc(14px*var(--ts))] text-muted-foreground hover:bg-foreground/[0.06]">Cancel</button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
