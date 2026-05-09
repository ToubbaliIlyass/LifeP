'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ChatPanelProps {
  apiKeyMissing?: boolean
}

export function ChatPanel({ apiKeyMissing = false }: ChatPanelProps) {
  const { messages, sendMessage, status, error } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
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

  if (apiKeyMissing) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-destructive">API key not configured</p>
        <p className="text-xs text-muted-foreground">
          Copy <code className="bg-muted px-1 py-0.5 rounded">.env.example</code> to{' '}
          <code className="bg-muted px-1 py-0.5 rounded">.env.local</code> and add your{' '}
          <code className="bg-muted px-1 py-0.5 rounded">GOOGLE_GENERATIVE_AI_API_KEY</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8">
            Tell me about your goals, habits, or anything on your mind.
          </p>
        )}
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {msg.parts.map((part, i) =>
                  part.type === 'text' ? <span key={i}>{part.text}</span> : null,
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2 text-sm text-muted-foreground animate-pulse">
                Thinking…
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-start">
              <div className="bg-destructive/10 text-destructive rounded-2xl px-4 py-2 text-sm">
                {error.message ?? 'Something went wrong. Try again.'}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to LifeP…"
          disabled={busy}
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
