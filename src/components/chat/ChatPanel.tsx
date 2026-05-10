'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ChatPanelProps {
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function ChatPanel({ inputRef }: ChatPanelProps) {
  const { messages, sendMessage, status, error } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const localInputRef = useRef<HTMLInputElement>(null)
  const resolvedRef = inputRef ?? localInputRef
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    sendMessage({ text })
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-start pt-10 pb-6">
            <p
              className="text-2xl font-medium italic text-foreground/80 leading-snug mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              What&apos;s on your mind?
            </p>
            <p className="text-sm text-muted-foreground">
              Tell me about your goals, habits, tasks, or anything you want to track.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.role === 'assistant' && (
                <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-1.5 ml-0.5">
                  LifeP
                </p>
              )}
              <div
                className={`max-w-[88%] text-[13.5px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5'
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
            <div className="flex items-start">
              <div className="flex items-center gap-1.5 px-1 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {error && (
            <div className="text-[12px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error.message ?? 'Something went wrong. Try again.'}
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-muted/50 border border-border/60 rounded-xl px-3 py-2 focus-within:border-border transition-colors"
        >
          <input
            ref={resolvedRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
            }}
            placeholder="Talk to LifeP…"
            disabled={busy}
            autoFocus
            className="flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground/50 outline-none resize-none min-h-[24px] py-0.5"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-90"
            aria-label="Send"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 ml-1 font-mono">
          / to focus · ⌘K to search
        </p>
      </div>
    </div>
  )
}
