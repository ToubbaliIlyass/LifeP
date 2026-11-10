'use client'

import { useEffect, useState } from 'react'
import { CatchUp } from '@/components/todos/CatchUp'
import { CheckIn } from '@/components/todos/CheckIn'
import { WeekReflection } from '@/components/todos/WeekReflection'
import { WhatsNext } from '@/components/todos/WhatsNext'
import { useTodos } from '@/components/todos/TodosProvider'
import { HelpCard } from '@/components/tuck/HelpCard'
import { safeGet, safeSet } from '@/lib/storage'
import { awayKey, pickTodayCard } from '@/lib/today-card'
import { dayFacts } from '@/lib/tuck/mood'
import { wallNow } from '@/lib/wallclock'

/**
 * The top of Today is one slot: a message from Tuck (src/lib/today-card.ts
 * picks which) when there is one, otherwise the Now card. Never a stack, so
 * the list is in view on the first phone screen.
 */
export function TodayCards({ date }: { date: string }) {
  const { ready, todos, lists, events } = useTodos()
  const [now, setNow] = useState(() => wallNow())
  // Put-away is remembered on this device, so it is read after mount, once
  // the server and the first client render agree.
  const [mounted, setMounted] = useState(false)
  const [, bump] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount, so server and first client render agree
    setMounted(true)
    const id = setInterval(() => setNow(wallNow()), 60_000)
    return () => clearInterval(id)
  }, [])

  const away = (key: string) => safeGet('local', key) === '1'
  const putAway = (key: string) => { safeSet('local', key, '1'); bump((n) => n + 1) }

  const card = mounted && ready
    ? pickTodayCard({ now, todos, lists, events, date, away })
    : null

  return (
    <>
      {card?.kind === 'catch-up' && <CatchUp date={date} onAway={() => putAway(awayKey.catchUp(date))} />}
      {card?.kind === 'week' && <WeekReflection date={date} onAway={() => putAway(awayKey.week(card.sunday))} />}
      {card?.kind === 'check-in' && <CheckIn date={date} onAway={() => putAway(awayKey.checkIn(date))} />}
      {card?.kind === 'help' && (
        <HelpCard mood={card.mood} level={dayFacts({ now, todos, lists, events }).level} onAway={() => putAway(awayKey.help(date, card.mood.key))} />
      )}
      {/* One slot: Tuck has something to say, or here is what to do now. Never both stacked. */}
      {!card && <WhatsNext date={date} />}
    </>
  )
}
