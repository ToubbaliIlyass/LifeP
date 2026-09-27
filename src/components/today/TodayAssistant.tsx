'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Keyboard, ArrowUp, Square, X, RotateCcw, ChevronRight, Loader2 } from 'lucide-react'
import type { UIMessage } from 'ai'
import { useAssistant } from '@/components/chat/AssistantProvider'
import { ToolActivity, isToolPart, type ToolPart } from '@/components/chat/ToolActivity'
import { FilePreview } from '@/components/chat/attachments'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { notifyDataChanged } from '@/lib/dataSignal'

const LISTEN_EVENT = 'acture:listen'
/** Set when listening was asked for before Today was on screen. */
let listenPending = false

/** Opens the assistant listening — from the phone's + button, anywhere. */
export function startListening() {
  listenPending = true
  window.dispatchEvent(new Event(LISTEN_EVENT))
}

function zone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined }
}

const textOf = (m: UIMessage | undefined) =>
  (m?.parts ?? []).map((p) => (p.type === 'text' ? p.text : '')).join(' ').trim()

/**
 * The way in: tap, speak, and the answer is on the screen.
 *
 * Voice first — the whole point is saying the day out loud rather than
 * filling anything in. Tap once and it listens (the bars say so), tap again
 * and what was said goes to the assistant, which adds it, plans it, and
 * answers here in writing. It never talks back. The day underneath redraws
 * as it works.
 *
 * Typing is one tap away for when speaking is not possible, and is where it
 * starts when the browser cannot hear at all. If the assistant cannot answer,
 * what was said can still go straight onto today as a task — it is never
 * lost to a failed request.
 */
export function TodayAssistant({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { messages, setMessages, sendMessage, stop, status, error } = useAssistant()
  const busy = status === 'submitted' || status === 'streaming'

  /** What speech has made of it so far; sent when listening ends. */
  const heard = useRef('')
  /** Set by Cancel, so stopping does not send. */
  const discard = useRef(false)
  const speech = useSpeechInput((text) => { heard.current = text })
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [showEarlier, setShowEarlier] = useState(false)
  const [rescue, setRescue] = useState<'idle' | 'saving' | 'saved'>('idle')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // A browser that cannot hear starts on the keyboard.
  const keyboard = typing || !speech.supported
  const active = speech.listening || speech.transcribing

  function send(said: string) {
    const t = said.trim()
    if (!t || busy) return
    setRescue('idle')
    setShowEarlier(false)
    sendMessage({ text: t })
  }

  function listen() {
    if (busy) return
    heard.current = ''
    discard.current = false
    speech.reset()
    speech.start()
  }

  function cancel() {
    discard.current = true
    speech.stop()
  }

  // Listening ended (and, for recorded speech, the words are back): send it.
  const wasActive = useRef(false)
  useEffect(() => {
    if (wasActive.current && !active) {
      const said = heard.current
      heard.current = ''
      if (!discard.current) send(said)
      discard.current = false
      speech.reset()
    }
    wasActive.current = active
    // send and speech are stable enough for this: only the edge matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // The phone's + button: straight into listening.
  useEffect(() => {
    const go = () => {
      listenPending = false
      if (keyboard) inputRef.current?.focus()
      else listen()
    }
    if (listenPending) go()
    window.addEventListener(LISTEN_EVENT, go)
    return () => window.removeEventListener(LISTEN_EVENT, go)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard])

  /** The assistant could not answer: put what was said on today as a task. */
  async function saveAsTask() {
    const said = textOf([...messages].reverse().find((m) => m.role === 'user'))
    if (!said) return
    setRescue('saving')
    const res = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: said, tz: zone() }),
    }).catch(() => null)
    setRescue(res?.ok ? 'saved' : 'idle')
    if (res?.ok) notifyDataChanged()
  }

  // The latest exchange is what is shown; the rest folds away.
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  const latest = lastUser === -1 ? [] : messages.slice(lastUser)
  const earlier = lastUser === -1 ? [] : messages.slice(0, lastUser)
  const reply = latest.find((m) => m.role === 'assistant')
  const replyHasContent = !!reply?.parts.some((p) => (p.type === 'text' && p.text.length > 0) || isToolPart(p))

  return (
    <section className="mb-8">
      <div className="rounded-2xl border border-border/70 bg-card shadow-[0_2px_12px_oklch(0_0_0/0.04)]">
        {active ? (
          // ── Listening ──────────────────────────────────────
          <div className="px-5 py-5">
            <div className="flex items-center gap-4">
              {/* The mic, alive: a ring breathing out from it, and a
                  waveform beside it — unmistakably "I am listening". */}
              <span className="relative w-12 h-12 shrink-0">
                {!speech.transcribing && (
                  <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping motion-reduce:hidden" />
                )}
                <span className="relative w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  {speech.transcribing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
                </span>
              </span>
              <div className="flex-1 min-w-0">
                {!speech.transcribing && (
                  <div className="flex items-center gap-[3px] h-7 mb-1" aria-hidden>
                    {[10, 22, 16, 28, 12, 24, 18, 26, 14, 20, 11, 23].map((h, i) => (
                      <span
                        key={i}
                        className="acture-voice-bar block w-[3px] rounded-full bg-primary/80"
                        style={{ height: h, animationDelay: `${(i % 5) * 0.12}s` }}
                      />
                    ))}
                  </div>
                )}
                <p className="text-[15px] text-foreground/85 leading-relaxed">
                  {speech.transcribing
                    ? 'Writing that down…'
                    : speech.transcript || (speech.mode === 'record' ? 'Recording — tap Done when you have said it all.' : 'Listening… say everything that needs to happen.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => speech.stop()}
                disabled={speech.transcribing}
                className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" /> Done
              </button>
              <button
                onClick={cancel}
                disabled={speech.transcribing}
                className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : keyboard ? (
          // ── Typing, when speaking is not an option ─────────
          <form
            onSubmit={(e) => { e.preventDefault(); send(text); setText('') }}
            className="flex items-end gap-2 px-4 py-3"
          >
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              autoFocus={typing}
              onChange={(e) => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); setText('') }
              }}
              placeholder="What needs to happen today?"
              aria-label="What needs to happen today"
              className="flex-1 min-w-0 bg-transparent text-[14.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/55 outline-none resize-none py-1.5 max-h-[140px] overflow-y-auto [scrollbar-width:none]"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={() => { setTyping(false); listen() }}
                aria-label="Speak instead"
                title="Speak instead"
                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label="Send"
              className="w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        ) : (
          // ── Resting: one big thing to press ───────────────
          <div className="flex items-center gap-3 px-4 py-3.5">
            <button
              onClick={listen}
              disabled={busy}
              className="group flex-1 min-w-0 flex items-center gap-4 text-left disabled:opacity-60"
            >
              <span className="w-12 h-12 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Mic className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] text-foreground">
                  {busy ? 'Working on it…' : 'Tap and say what needs to happen'}
                </span>
                <span className="block text-[12px] text-muted-foreground/75 mt-0.5">
                  It adds it, plans your day, and answers here.
                </span>
              </span>
            </button>
            <button
              onClick={() => setTyping(true)}
              aria-label="Type instead"
              title="Type instead"
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        )}
        {speech.error && !active && (
          <p className="px-5 pb-3 -mt-1 text-[12px] text-destructive/80">{speech.error}</p>
        )}
      </div>

      {/* ── The answer, on the screen ─────────────────────── */}
      {latest.length > 0 && (
        <div className="mt-3 px-1">
          {earlier.length > 0 && (
            <button
              onClick={() => setShowEarlier((v) => !v)}
              className="flex items-center gap-1 mb-2 text-[11.5px] text-muted-foreground/65 hover:text-foreground"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${showEarlier ? 'rotate-90' : ''}`} />
              Earlier in this conversation
            </button>
          )}
          {showEarlier && (
            <div className="mb-3 pl-3 border-l border-border/60 space-y-2.5 opacity-75">
              {earlier.map((m) => <Message key={m.id} message={m} onNavigate={onNavigate} />)}
            </div>
          )}

          <div className="space-y-2.5">
            {latest.map((m) => <Message key={m.id} message={m} onNavigate={onNavigate} />)}

            {busy && !replyHasContent && (
              <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:300ms]" />
              </div>
            )}

            {error && !busy && (
              <div className="rounded-lg bg-destructive/[0.07] px-3 py-2.5 text-[12.5px]">
                <p className="text-destructive/90">Couldn&apos;t get an answer{error.message ? ` — ${error.message}` : ''}.</p>
                {rescue === 'saved' ? (
                  <p className="mt-1 text-foreground/75">Put on today as a task instead.</p>
                ) : (
                  <button
                    onClick={saveAsTask}
                    disabled={rescue === 'saving'}
                    className="mt-1.5 text-[12px] font-semibold underline underline-offset-2 text-foreground/85 hover:text-foreground disabled:opacity-50"
                  >
                    {rescue === 'saving' ? 'Adding…' : 'Add what I said to today as a task'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2.5">
            {busy ? (
              <button onClick={stop} className="text-[11.5px] text-muted-foreground/70 hover:text-foreground">Stop</button>
            ) : (
              <button
                onClick={() => { setMessages([]); setRescue('idle') }}
                className="flex items-center gap-1 text-[11.5px] text-muted-foreground/65 hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** One turn: what was said, quoted; what came back, as text and action cards. */
function Message({ message, onNavigate }: { message: UIMessage; onNavigate?: (tab: string) => void }) {
  if (message.role === 'user') {
    return (
      <p className="text-[12.5px] text-muted-foreground/80 italic">
        &ldquo;{textOf(message) || 'Attachment'}&rdquo;
      </p>
    )
  }
  return (
    <div className="space-y-1.5 text-[14px] leading-relaxed text-foreground/90">
      {message.parts.map((part, i) => {
        if (part.type === 'text') return part.text ? <p key={i} className="whitespace-pre-wrap">{part.text}</p> : null
        if (part.type === 'file') return <FilePreview key={i} part={part} size="sm" />
        if (isToolPart(part)) {
          return (
            <ToolActivity
              key={i}
              part={part as ToolPart}
              onReviewProposals={onNavigate ? () => onNavigate('proposals') : undefined}
              onOpenCalendar={onNavigate ? () => onNavigate('calendar') : undefined}
            />
          )
        }
        return null
      })}
    </div>
  )
}
