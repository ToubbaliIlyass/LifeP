'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, AlertCircle, Check } from 'lucide-react'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { MicButton } from '@/components/ui/mic-button'

/**
 * Say this part of setup instead of filling it in.
 *
 * The forms below it are still the truth — this only writes into them. What
 * comes back from the model lands in the same boxes the user would have
 * typed into, so a misheard time is a wrong number they are already looking
 * at rather than a wrong class on next week's calendar. Nothing here reaches
 * the database; Finish still does that.
 *
 * The transcript stays visible and editable after dictating, for the usual
 * reason: speech recognition mishears names far more often than it mishears
 * numbers, and fixing one word is quicker than saying the paragraph again.
 *
 * It is one box with a microphone in the corner of it, like the chat
 * composer — not a panel of its own. Speaking and typing are the same act
 * here, they go to the same place, and giving dictation its own bordered
 * region made it look like a separate feature to be decided about rather
 * than simply the other way to fill the box in.
 */
export function DictateBlock<T>({
  section,
  placeholder,
  examples,
  onDraft,
}: {
  /** Which schema the server should read the transcript against. */
  section: 'day' | 'week' | 'habits' | 'goals'
  placeholder: string
  /** One spoken answer that would work, to show the shape expected. */
  examples: string
  /** Called with whatever the model pulled out, to merge into the form. */
  onDraft: (draft: T) => number
}) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'thinking'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<number | null>(null)

  /*
   * Dictation appends to whatever was already in the box rather than
   * replacing it. The hook hands back the whole transcript each time, so what
   * was there when this take started is held aside and put back in front of
   * it — otherwise saying a second sentence after fixing a word by hand would
   * wipe the fix, and clearing the hook at the start of each take is what
   * stops the previous take arriving twice.
   */
  const [kept, setKept] = useState('')
  const textRef = useRef('')
  useEffect(() => { textRef.current = text }, [text])

  const speech = useSpeechInput(useCallback((spoken: string) => {
    setText(kept ? `${kept} ${spoken}` : spoken)
  }, [kept]))

  const { listening, reset } = speech
  useEffect(() => {
    if (!listening) return
    setKept(textRef.current.trim())
    reset()
  }, [listening, reset])

  async function fill() {
    const spoken = text.trim()
    if (spoken.length < 8) return
    setState('thinking')
    setError(null)
    setAdded(null)
    try {
      const res = await fetch('/api/onboarding/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, text: spoken }),
      })
      const data = (await res.json().catch(() => null)) as { draft?: T; error?: string } | null
      if (!res.ok || !data?.draft) {
        setError(data?.error ?? 'That did not come back. Try again, or type it in below.')
        return
      }
      const count = onDraft(data.draft)
      if (count === 0) {
        setError('Nothing in that fit this step — try the free-text step at the end.')
        return
      }
      setAdded(count)
      // Cleared once it has landed in the fields: what was said is now
      // visible as rows, and leaving the paragraph there invites pressing
      // the button twice and getting everything in duplicate.
      setText('')
      setKept('')
      speech.reset()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setState('idle')
    }
  }

  // The live path shows words as they are spoken; the record path has
  // nothing to show until the clip has been transcribed.
  const shown = speech.listening && speech.mode === 'live'
    ? [kept, speech.transcript].filter(Boolean).join(' ')
    : text
  const busy = state === 'thinking'

  return (
    <div className="ob-dictate">
      <div className="ob-field-wrap">
        <textarea
          value={shown}
          onChange={(e) => setText(e.target.value)}
          readOnly={speech.listening}
          rows={3}
          aria-label="Say or write this step in your own words"
          placeholder={
            speech.transcribing ? 'Writing that down…'
              : speech.listening ? (speech.mode === 'record' ? 'Recording — press stop when you are done' : 'Listening…')
              : `${placeholder}  ${examples}`
          }
          className="ob-field ob-field-dictate font-serif resize-y"
          style={{ lineHeight: 1.55 }}
        />
        {/* In the corner of the box it fills, exactly where the chat keeps
            its own. Absent when the browser has no microphone to offer, and
            the box is then simply typed into. */}
        <span className="ob-field-mic"><MicButton speech={speech} className="w-8 h-8" /></span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          onClick={fill}
          disabled={busy || speech.listening || shown.trim().length < 8}
          className="ob-btn ob-btn-primary"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy ? 'Working it out…' : 'Fill in the fields'}
        </button>
        <span className="text-[11.5px] text-muted-foreground/55">
          {speech.supported
            ? 'Say it or write it, and the fields below fill in.'
            : 'Write it in plain words and the fields below fill in.'}
        </span>
      </div>

      {added !== null && !error && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground/75 mt-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          Added {added} {added === 1 ? 'entry' : 'entries'} below — check them over and fix anything it misheard.
        </p>
      )}
      {(error ?? speech.error) && (
        <p className="flex items-start gap-1.5 text-[12px] text-destructive mt-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> {error ?? speech.error}
        </p>
      )}
    </div>
  )
}
