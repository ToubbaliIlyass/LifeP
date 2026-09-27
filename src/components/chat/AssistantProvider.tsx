'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { notifyDataChanged } from '@/lib/dataSignal'

/*
 * Every request carries the browser's time zone, so "today" and "now" in the
 * assistant — and the day it plans — are the user's, not the server's.
 */
const transport = new DefaultChatTransport({
  api: '/api/chat',
  headers: (): Record<string, string> => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      return zone ? { 'x-time-zone': zone } : {}
    } catch {
      return {}
    }
  },
})

type Assistant = ReturnType<typeof useChat>

const AssistantContext = createContext<Assistant | null>(null)

/**
 * One conversation for the whole app.
 *
 * The assistant is spoken to on Today and, in the full app, in the side
 * panel; both are the same conversation. It lives up here rather than in
 * either of them so that moving between tabs — which unmounts Today — does
 * not wipe what was just said.
 *
 * Whatever it changes shows at once: the day is told to redraw each time a
 * tool finishes (so the plan under the conversation moves as the assistant
 * adds and plans, not only once it has finished talking), and again when the
 * reply ends.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat({ transport })

  const finishedTools = chat.messages.reduce(
    (n, m) => n + m.parts.filter((p) => 'state' in p && p.state === 'output-available').length,
    0,
  )
  const seenTools = useRef(finishedTools)
  useEffect(() => {
    if (finishedTools > seenTools.current) notifyDataChanged()
    seenTools.current = finishedTools
  }, [finishedTools])

  const prevStatus = useRef(chat.status)
  useEffect(() => {
    if ((prevStatus.current === 'streaming' || prevStatus.current === 'submitted') && chat.status === 'ready') {
      notifyDataChanged()
    }
    prevStatus.current = chat.status
  }, [chat.status])

  return <AssistantContext.Provider value={chat}>{children}</AssistantContext.Provider>
}

export function useAssistant(): Assistant {
  const chat = useContext(AssistantContext)
  if (!chat) throw new Error('useAssistant must be used inside AssistantProvider')
  return chat
}
