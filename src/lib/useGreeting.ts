'use client'

import { useSyncExternalStore } from 'react'
import { greetingFor } from '@/lib/greeting'

/**
 * The greeting, from the reader's clock rather than the build server's.
 *
 * Read through `useSyncExternalStore` for the same reason the theme is: the
 * time of day is a browser fact, not React state. The server has no useful
 * answer — this page is prerendered, so "the server" is whenever the site
 * was last built — so it renders a neutral hello and the real greeting
 * arrives on hydration.
 *
 * The minute tick is not decoration: the chat panel can sit open across
 * noon, and a greeting that is wrong because you did not reload is the same
 * bug in miniature.
 */
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000)
  return () => clearInterval(id)
}

const fromClock = () => greetingFor(new Date().getHours())
const onServer = () => 'Hello'

export function useGreeting(): string {
  return useSyncExternalStore(subscribe, fromClock, onServer)
}
