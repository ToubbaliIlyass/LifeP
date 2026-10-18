'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mic, Keyboard, ArrowUp, Square, X, RotateCcw, ChevronRight, Loader2 } from 'lucide-react'
import type { UIMessage } from 'ai'
import { useAssistant } from '@/components/chat/AssistantProvider'
import { ToolActivity, isToolPart, type ToolPart } from '@/components/chat/ToolActivity'
import { AttachButton, AttachmentStrip, FilePreview, useAttachments } from '@/components/chat/attachments'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { notifyDataChanged } from '@/lib/dataSignal'
import { clockZone } from '@/lib/wallclock'

const LISTEN_EVENT = 'acture:listen'
/** Set when the assistant was asked for before its bar was on screen. */
let listenPending = false
/** How it was asked for: by voice, by typing, or with something to read. */
let pendingMode: 'listen' | 'type' | 'attach' = 'listen'
/** What was handed over to read, for 'attach'. */
let pendingFiles: File[] = []
/** What it is being asked about, when that is not the usual "what needs to happen". */
let pendingPrompt: string | null = null

/** Opens the assistant listening — from the mic, Ctrl+C, anywhere. */
export function startListening(prompt: string | null = null) {
  listenPending = true
  pendingMode = 'listen'
  pendingPrompt = prompt
  window.dispatchEvent(new Event(LISTEN_EVENT))
}

/** Opens the assistant's keyboard, with the question it is asking in place of the usual one. */
export function startTyping(prompt: string | null = null) {
  listenPending = true
  pendingMode = 'type'
  pendingPrompt = prompt
  window.dispatchEvent(new Event(LISTEN_EVENT))
}

/** Opens the assistant with these attached — a screenshot, a photo, a PDF — to say what they are about. */
export function attachFiles(files: FileList | File[]) {
  listenPending = true
  pendingMode = 'attach'
  pendingFiles = Array.from(files)
  pendingPrompt = null
  window.dispatchEvent(new Event(LISTEN_EVENT))
}

/** Marks what opens the assistant, so pressing it is not taken as a press outside that closes it. */
export const ASSISTANT_TRIGGER = 'data-assistant-trigger'

/** The user's zone, pinned in Settings or the browser's — see src/lib/wallclock.ts. */
const zone = clockZone

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
 * starts when the browser cannot hear at all. A picture is a way in too: a
 * photo of a timetable, a flyer, a whiteboard, a screenshot of a message —
 * pasted, dropped or attached, and read for what needs doing. If the assistant cannot answer,
 * what was said can still go straight onto today as a task — it is never
 * lost to a failed request.
 */
export function TodayAssistant({ onNavigate, dock = false }: {
  onNavigate?: (tab: string) => void
  /**
   * Docked at the foot of a list rather than heading a page: an island that
   * is there only while in use, opened from Quick Capture in the sidebar.
   */
  dock?: boolean
}) {
  const { messages, setMessages, sendMessage, stop, status, error } = useAssistant()
  const busy = status === 'submitted' || status === 'streaming'

  /** What speech has made of it so far; sent when listening ends. */
  const heard = useRef('')
  /** Set by Cancel, so stopping does not send. */
  const discard = useRef(false)
  /** Set when a recording was cut off to type or attach, so its end does not close the island. */
  const handedOver = useRef(false)
  const speech = useSpeechInput((text) => { heard.current = text })
  const [typing, setTyping] = useState(false)
  /** The question being asked, when it is not "what needs to happen" — the evening check-in. */
  const [prompt, setPrompt] = useState<string | null>(null)
  const [text, setText] = useState('')
  /**
   * In the island, once what is typed runs past a line it gets the whole
   * width and the buttons drop to a row underneath — rather than the text
   * wrapping in a column beside an empty strip above the buttons. It stays
   * that way until the box is emptied, so it does not flick back and forth
   * as the wider box re-wraps.
   */
  const [multi, setMulti] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const [rescue, setRescue] = useState<'idle' | 'saving' | 'saved'>('idle')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // The box grows with what is typed (up to a limit), and in the island
  // switches to full width once it passes one line.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
    setMulti((m) => (text ? m || el.scrollHeight > 40 : false))
  }, [text, multi])
  const attachments = useAttachments()
  const hasFiles = attachments.items.length > 0
  /** Docked: the conversation is open over everything, until it is closed. */
  const [open, setOpen] = useState(false)

  // A browser that cannot hear starts on the keyboard.
  const keyboard = typing || !speech.supported
  /**
   * Asked to listen, and the mic not yet on: it takes a moment to start, and
   * in that moment the listening view is shown already rather than a flash
   * of the keyboard. Ends when the mic is on, or did not come on.
   */
  const [arming, setArming] = useState(false)
  const live = speech.listening || speech.transcribing
  useEffect(() => {
    if (!arming) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the wait the moment the mic answers
    if (live || speech.error) { setArming(false); return }
    const t = setTimeout(() => setArming(false), 2500)
    return () => clearTimeout(t)
  }, [arming, live, speech.error])
  const active = live
  /** What is on screen: listening, or about to be. */
  const listeningView = live || arming

  function send(said: string) {
    const t = said.trim()
    const files = attachments.items.map((a) => a.part)
    if ((!t && files.length === 0) || busy) return
    setRescue('idle')
    setShowEarlier(false)
    setPrompt(null)
    if (dock) setOpen(true)
    sendMessage(files.length > 0
      ? { text: t || 'Pull out everything in this that needs doing or happens at a time, and put it on my day.', files }
      : { text: t })
    attachments.clear()
  }

  // A screenshot pasted or a photo dropped anywhere on the card is taken in.
  const fileProps = {
    onPaste: (e: React.ClipboardEvent) => {
      if (e.clipboardData.files.length) { e.preventDefault(); attachments.add(e.clipboardData.files) }
    },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() },
    onDrop: (e: React.DragEvent) => {
      if (e.dataTransfer.files.length) { e.preventDefault(); attachments.add(e.dataTransfer.files) }
    },
  }

  function listen() {
    if (busy) return
    heard.current = ''
    discard.current = false
    handedOver.current = false
    speech.reset()
    setArming(true)
    speech.start()
  }

  function cancel() {
    discard.current = true
    setArming(false)
    speech.cancel()
    // Cancelled before the mic came on, with nothing else here: nothing to keep open.
    if (dock && !live && messages.length === 0 && attachments.items.length === 0) close()
  }

  /** The island, so closing can play out before it goes. */
  const shell = useRef<HTMLDivElement>(null)
  /** The closing animation, while it plays — cancelled if it is opened again meanwhile. */
  const closing = useRef<Animation | null>(null)

  /** Docked: away, sinking back down as it goes. */
  function close() {
    const finish = () => {
      closing.current = null
      setOpen(false)
      setTyping(false)
      setPrompt(null)
    }
    const el = shell.current
    if (closing.current) return
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return }
    closing.current = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px) scale(0.97)' }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    )
    closing.current.onfinish = finish
  }

  // Listening ended (and, for recorded speech, the words are back): send it.
  const wasActive = useRef(false)
  useEffect(() => {
    if (wasActive.current && !active) {
      const said = heard.current
      heard.current = ''
      if (!discard.current) send(said)
      // Nothing came of it and nothing came before it: nothing to keep open.
      // (Not when it was cut off to type or attach instead: that is still open on purpose.)
      if ((discard.current || !said.trim()) && !handedOver.current && messages.length === 0 && attachments.items.length === 0) setOpen(false)
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
      setPrompt(pendingPrompt)
      if (dock) { closing.current?.cancel(); closing.current = null; setOpen(true) }
      // Asked to type or to read something: any recording still going —
      // or still starting — is cut off, not carried into the island.
      if (pendingMode !== 'listen') { discard.current = true; handedOver.current = true; speech.cancel() }
      if (pendingMode === 'attach') {
        attachments.add(pendingFiles)
        pendingFiles = []
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      // Typing asked for, or no speech here: open the keyboard.
      else if (pendingMode === 'type' || keyboard) { setTyping(true); requestAnimationFrame(() => inputRef.current?.focus()) }
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

  const bar = (
      <div
        {...fileProps}
        // Docked, it is the list's bottom toolbar, as in Things: no card, no
        // shadow, nothing floating — a line across the foot of the page.
        className={dock ? '' : 'rounded-2xl border border-border/70 bg-card shadow-[0_2px_12px_oklch(0_0_0/0.04)]'}
      >
        {listeningView ? (
          // ── Listening ──────────────────────────────────────
          <div className={dock ? 'px-2 py-3' : 'px-5 py-5'}>
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
                    : speech.transcript || prompt || (speech.mode === 'record' ? 'Recording — tap Done when you have said it all.' : 'Listening… say everything that needs to happen.')}
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-2 ${dock ? 'mt-3' : 'mt-4'}`}>
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
        ) : keyboard || dock ? (
          // ── Typing: when speaking is not an option, and always in the
          //    island, where the mic is one of its buttons ─────────
          <>
          {dock && (hasFiles || attachments.error) && (
            // 6px here and 6px of the strip's own room: 12px to the edge,
            // round 12px, so the card's corner follows the island's 24px.
            <div className="pl-1.5 pr-1 pt-1.5 -mb-2">
              <AttachmentStrip round items={attachments.items} onRemove={attachments.remove} error={attachments.error} />
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); send(text); setText('') }}
            // Buttons keep to the last line as the text grows.
            className={`flex ${!dock ? 'items-end gap-2 py-3 px-4' : multi ? 'flex-col gap-0.5 py-1.5 pl-1.5' : 'items-end gap-1 py-1.5 pl-1.5'}`}
          >
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              autoFocus={typing || dock}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); setText('') }
              }}
              placeholder={
                prompt ?? (hasFiles ? 'Say what it is about, or just send' : dock && latest.length > 0 ? 'Reply…' : 'What needs to happen today?')
              }
              aria-label="What needs to happen today"
              className={`${dock && multi ? 'w-full pr-1.5' : 'flex-1 self-center'} min-w-0 bg-transparent text-[14.5px] leading-6 text-foreground placeholder:text-muted-foreground/55 outline-none resize-none py-1.5 max-h-[140px] overflow-y-auto [scrollbar-width:none]`}
            />
            <div className={`flex items-center shrink-0 ${dock ? 'gap-1' : 'gap-2'} ${dock && multi ? 'self-end' : ''}`}>
            <AttachButton onFiles={attachments.add} disabled={busy} className="w-9 h-9 rounded-full" />
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
              disabled={busy || (!text.trim() && !hasFiles)}
              aria-label="Send"
              className="w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            </div>
          </form>
          </>
        ) : (
          // ── Resting: one big thing to press ───────────────
          <div className={`flex items-center ${dock ? 'gap-1 h-11' : 'gap-3 px-4 py-3.5'}`}>
            <button
              onClick={listen}
              disabled={busy}
              className={`group flex-1 min-w-0 flex items-center text-left disabled:opacity-60 ${dock ? 'gap-2 -ml-1.5 pl-1.5 pr-2 py-1 rounded-md hover:bg-foreground/[0.04]' : 'gap-4'}`}
            >
              <span className={dock
                ? 'shrink-0 grid place-items-center w-[15px] text-muted-foreground group-hover:text-foreground'
                : 'shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform w-12 h-12'}
              >
                <Mic className={dock ? 'w-4 h-4' : 'w-5 h-5'} />
              </span>
              <span className="min-w-0">
                <span className={`block truncate ${dock ? 'text-[13.5px] text-muted-foreground group-hover:text-foreground' : 'text-[16px] text-foreground'}`}>
                  {busy ? 'Working on it…' : open && latest.length > 0 ? 'Say or type a reply' : dock ? 'Say or type what needs to happen' : 'Tap and say what needs to happen'}
                </span>
                {!dock && (
                  <span className="block text-[12px] text-muted-foreground/75 mt-0.5">
                    It adds it, plans your day, and answers here.
                  </span>
                )}
              </span>
            </button>
            <AttachButton onFiles={attachments.add} disabled={busy} className="w-9 h-9 rounded-full" />
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
        {/* Something attached: shown, and one press to read it — or say or
            type what it is about first, and that goes with it. */}
        {(hasFiles || attachments.error) && !active && !dock && (
          <div className="px-4 pb-3.5 -mt-1">
            <AttachmentStrip items={attachments.items} onRemove={attachments.remove} error={attachments.error} />
            {hasFiles && (
              <button
                onClick={() => { send(text); setText('') }}
                disabled={busy}
                className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Add what&apos;s in {attachments.items.length === 1 ? 'it' : 'them'} to my day
              </button>
            )}
          </div>
        )}
        {speech.error && !active && (
          <p className={`${dock ? 'px-2' : 'px-5'} pb-3 -mt-1 text-[12px] text-destructive/80`}>{speech.error}</p>
        )}
      </div>
  )

  const failure = error && !busy && (
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
  )

  // Docked, it is an island at the foot of the list that is only there while
  // it is in use — started from Quick Capture in the sidebar — and swells into
  // whatever is happening: listening, typing, the answer.
  if (dock) {
    if (!open) return null
    const mode: 'compose' | 'talk' = latest.length > 0 ? 'talk' : 'compose'
    return (
      <div className="relative flex justify-center h-0">
        <Island mode={mode} canClose={!listeningView} onClose={close} shellRef={shell}>
          {mode === 'compose' ? (
            <div className="w-[var(--island-w,560px)] px-1.5">{bar}</div>
          ) : (
            // A column that never outgrows the screen: the conversation in the
            // middle scrolls, the bar on top and the box below stay put.
            <div className="w-[var(--island-w,620px)] max-h-[var(--island-max,80vh)] flex flex-col">
              <div className="shrink-0 flex items-center gap-1 pl-4 pr-2 pt-2">
                <span className="flex-1 text-[12px] font-medium text-muted-foreground/80">Assistant</span>
                {busy ? (
                  <button onClick={stop} className="text-[12px] px-2.5 py-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60">
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => { setMessages([]); setRescue('idle'); close() }}
                    className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear
                  </button>
                )}
                <button
                  onClick={close}
                  disabled={listeningView}
                  aria-label="Close (Esc)"
                  title="Close (Esc)"
                  className="grid place-items-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Thread
                messages={messages}
                thinking={busy && !reply?.parts.some((p) => p.type === 'text' && p.text.length > 0)}
                busy={busy}
                failure={failure}
                onNavigate={onNavigate}
              />
              <div className="shrink-0 px-1.5">{bar}</div>
            </div>
          )}
        </Island>
      </div>
    )
  }

  return (
    <section className="mb-8">
      {bar}

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

            {failure}
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

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
/** An unstretched list's width: 740px less its 48px sides. */
const OPEN_MAX = 644

/**
 * The island: one shape that takes the size of whatever is inside it, and
 * gets there smoothly — measured, then sized to the measure, so the width and
 * height can be animated where `auto` cannot. Anchored at the bottom, so it
 * grows upwards over the list and never pushes it.
 */
function Island({ mode, canClose, onClose, shellRef: shell, children }: {
  mode: 'compose' | 'talk'
  canClose: boolean
  onClose: () => void
  shellRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  /** Off until the first measure, so it does not animate in from nothing. */
  const [settled, setSettled] = useState(false)
  /** Whether it has been drawn before, so there is a shape to grow from. */
  const drawn = useRef(false)
  /** The list's width, which the island takes when open. */
  const [lane, setLane] = useState<number | null>(null)
  /**
   * How tall it may be: the part of the screen that can actually be seen,
   * less a margin. On a phone the keyboard takes half of it, and an island
   * sized for the whole screen had its top — Clear and Close — pushed out of
   * sight with no way to reach them. So the conversation inside gives way
   * (it scrolls) and the bar and the box stay on screen.
   */
  const [room, setRoom] = useState<number | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    const measure = () => {
      const visible = vv?.height ?? window.innerHeight
      // How far the island's foot sits above the bottom of the page.
      const foot = shell.current?.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight
      const gap = Math.max(0, window.innerHeight - foot)
      setRoom(Math.max(160, Math.round(visible - gap - 20)))
    }
    measure()
    vv?.addEventListener('resize', measure)
    window.addEventListener('resize', measure)
    return () => { vv?.removeEventListener('resize', measure); window.removeEventListener('resize', measure) }
  }, [shell])

  useLayoutEffect(() => {
    const parent = shell.current?.parentElement
    if (!parent) return
    const measure = () => setLane(parent.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    // It rises into place.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shell.current?.animate(
        [{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE },
      )
    }
    return () => ro.disconnect()
  }, [shell])

  useLayoutEffect(() => {
    const el = content.current
    if (!el) return
    const measure = () => {
      setSize({ w: el.offsetWidth, h: el.offsetHeight })
      requestAnimationFrame(() => setSettled(true))
    }
    measure()
    // What is inside settles in as the shape grows round it — though not on
    // first paint, where there is nothing to grow from.
    if (drawn.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate(
        [{ opacity: 0, filter: 'blur(6px)', transform: 'scale(0.96)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }],
        { duration: 380, easing: EASE, fill: 'backwards' },
      )
    }
    drawn.current = true
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  // Open, it closes on Escape or a press anywhere else — but never mid-sentence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !canClose) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (!canClose || shell.current?.contains(t) || t.closest?.(`[${ASSISTANT_TRIGGER}]`)) return
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [canClose, onClose, shell])

  return (
    <div
      ref={shell}
      role="dialog"
      aria-label="Assistant"
      data-island=""
      style={{
        // Open, the inside is drawn at the list's width (less the border);
        // wider lists — stretched — stop at the width of an unstretched one.
        ['--island-w' as string]: lane ? `${Math.min(lane, OPEN_MAX) - 2}px` : undefined,
        ['--island-max' as string]: room ? `${room}px` : undefined,
        width: size?.w ?? 'max-content',
        height: size?.h ?? 'auto',
        // Concentric with what is inside: 24 inside the 1px border, which
        // is each inner corner plus its gap to the edge (send button 18 + 6,
        // attachment 12 + 12).
        borderRadius: 25,
        transition: settled ? `width 460ms ${EASE}, height 460ms ${EASE}, border-radius 460ms ${EASE}` : 'none',
      }}
      // Centred by margins and flex, not transforms: nothing to fight the
      // entrance animation, and the inside stays centred while the shell
      // catches up with it.
      className={`pointer-events-auto absolute bottom-0 inset-x-0 mx-auto z-20 flex items-end justify-center overflow-hidden box-content border border-border/70 bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_12px_32px_rgb(0_0_0/0.22)] motion-reduce:![transition:none]`}
    >
      {/* Drawn at its own size and pinned to the bottom, so while the shell
          catches up it is revealed from the bottom edge upwards. */}
      <div ref={content} key={mode} className="shrink-0 w-max origin-bottom">
        {children}
      </div>
    </div>
  )
}

/** The conversation inside the island, newest at the bottom and kept in view. */
function Thread({ messages, thinking, busy, failure, onNavigate }: {
  messages: UIMessage[]
  thinking: boolean
  busy: boolean
  failure: React.ReactNode
  onNavigate?: (tab: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]
  const tail = `${messages.length}:${last?.parts.length}:${textOf(last).length}:${thinking}`
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [tail])

  return (
    <div ref={scroller} className="min-h-0 flex-1 max-h-[min(52vh,460px)] overflow-y-auto overscroll-contain px-4 pt-2 pb-4 space-y-4 [scrollbar-width:thin]">
      {messages.map((m, i) => (
        <Message key={m.id} message={m} onNavigate={onNavigate} chat live={busy && i === messages.length - 1} />
      ))}
      {thinking && (
        <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45 animate-bounce [animation-delay:300ms]" />
        </div>
      )}
      {failure}
    </div>
  )
}


/** One turn: what was said, quoted; what came back, as text and action cards. */
function Message({ message, onNavigate, chat = false, live = false }: {
  message: UIMessage
  onNavigate?: (tab: string) => void
  /**
   * In the island: what was said sits on the right, as a bubble, and what
   * came back is the answer alone — no cards for what was done on the way.
   */
  chat?: boolean
  /** Still being written. */
  live?: boolean
}) {
  if (message.role === 'user') {
    const files = message.parts.filter((p) => p.type === 'file')
    if (chat) {
      return (
        <div className="flex flex-col items-end gap-1.5">
          {files.length > 0 && (
            <div className="flex gap-1.5">
              {files.map((f, i) => <FilePreview key={i} part={f} size="sm" />)}
            </div>
          )}
          {textOf(message) && (
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
              {textOf(message)}
            </p>
          )}
        </div>
      )
    }
    return (
      <div className="space-y-1.5">
        {files.length > 0 && (
          <div className="flex gap-1.5">
            {files.map((f, i) => <FilePreview key={i} part={f} size="sm" />)}
          </div>
        )}
        {textOf(message) && (
          <p className="text-[12.5px] text-muted-foreground/80 italic">&ldquo;{textOf(message)}&rdquo;</p>
        )}
      </div>
    )
  }
  if (chat) {
    const said = message.parts.filter((p) => p.type === 'text' && p.text)
    // Only actions, and finished: say so rather than show nothing.
    if (said.length === 0) {
      return live || !message.parts.some(isToolPart) ? null : <p className="text-[14.5px] text-foreground/90">Done.</p>
    }
    return (
      <div className="space-y-1.5 text-[14.5px] leading-relaxed text-foreground/90">
        {said.map((p, i) => <p key={i} className="whitespace-pre-wrap">{p.type === 'text' ? p.text : null}</p>)}
      </div>
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
              onOpenDay={onNavigate ? () => onNavigate('today') : undefined}
            />
          )
        }
        return null
      })}
    </div>
  )
}
