'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'

interface ChatPanelProps {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  onMutated?: () => void
}

const SUGGESTIONS = [
  { label: 'Set a goal', prompt: 'I want to set a new goal: ' },
  { label: 'Log a habit', prompt: 'I completed my habit today — ' },
  { label: 'Add a task', prompt: 'I need to add a task: ' },
  { label: "Plan my day", prompt: 'Help me plan my day' },
]

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export function ChatPanel({ inputRef, onMutated }: ChatPanelProps) {
  const { messages, sendMessage, status, error } = useChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const localInputRef = useRef<HTMLTextAreaElement>(null)
  const resolvedRef = inputRef ?? localInputRef
  const busy = status === 'submitted' || status === 'streaming'
  const empty = messages.length === 0

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const prevStatus = useRef(status)
  useEffect(() => {
    if ((prevStatus.current === 'streaming' || prevStatus.current === 'submitted') && status === 'ready') {
      onMutated?.()
    }
    prevStatus.current = status
  }, [status, onMutated])

  function submit(text?: string) {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    // Reset textarea height after clearing
    if (resolvedRef.current) {
      resolvedRef.current.style.height = 'auto'
    }
    sendMessage({ text: t })
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    submit()
  }

  // ── Empty state ────────────────────────────────────────
  if (empty) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
          <p className="text-3xl font-bold text-foreground mb-1">
            {getGreeting()}, Ilyass
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            What do you want to track today?
          </p>

          <div className="w-full max-w-md">
            <form
              onSubmit={handleSubmit}
              className="bg-card border border-border/70 rounded-2xl shadow-[0_4px_24px_oklch(0_0_0/0.15)] px-4 pt-4 pb-3"
            >
              <textarea
                ref={resolvedRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value)
                  autoResize(e.target)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                placeholder="Tell me about your goals, habits, tasks…"
                disabled={busy}
                autoFocus
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none resize-none overflow-hidden min-h-[48px] max-h-[200px] overflow-y-auto leading-relaxed"
              />
              <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/40">
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-30 transition-opacity hover:opacity-90"
                >
                  Send
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </form>

            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.prompt)
                    const el = resolvedRef.current
                    if (el) { el.focus(); autoResize(el) }
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Active chat ────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 min-h-0">
        <div className="px-5 max-w-2xl mx-auto space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.role === 'assistant' && (
                <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-1.5 ml-0.5">
                  LifeP
                </p>
              )}
              <div
                className={`max-w-[88%] text-[13.5px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 font-medium'
                    : 'text-foreground/90'
                }`}
              >
                {msg.parts.map((part, i) =>
                  part.type === 'text' ? <span key={i}>{part.text}</span> : null,
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-1.5 px-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          {error && (
            <div className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error.message ?? 'Something went wrong. Try again.'}
            </div>
          )}
        </div>
      </div>

      {/* Bottom input */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-muted/40 border border-border/60 rounded-xl px-3 py-2 focus-within:border-border/80 transition-colors max-w-2xl mx-auto"
        >
          <textarea
            ref={resolvedRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value)
              autoResize(e.target)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Reply…"
            disabled={busy}
            className="flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground/40 outline-none resize-none overflow-hidden max-h-[160px] overflow-y-auto leading-relaxed"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-90 mb-0.5"
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
