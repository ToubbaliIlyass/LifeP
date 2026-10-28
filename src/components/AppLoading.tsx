'use client'

import { Tuck } from '@/components/ui/Tuck'

/**
 * The hold between the splash and knowing who is looking.
 *
 * Settings say which tabs exist, which modules are on, and — the reason this
 * screen exists at all — whether this person has been through setup. They
 * come from the database, so for the first moment of a reload the app knows
 * none of it, and what it used to do was render the full dashboard against
 * those defaults and then throw the setup interview over the top of it. A
 * new user saw somebody else's app for a frame and a half before being asked
 * their first question.
 *
 * So: nothing is shown until there is something true to show. It is an
 * overlay rather than an early return so the dashboard underneath mounts and
 * starts its own fetches while this covers it — the wait is used, not added.
 *
 * What is shown while it waits is Tuck, digging: four frames, a loop.
 */
export function AppLoading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-1 bg-background" role="status" aria-label="Loading">
      <Tuck state="loading-1" size={112} decorative />
      <p className="text-[13px] text-muted-foreground" aria-hidden>Digging…</p>
    </div>
  )
}
