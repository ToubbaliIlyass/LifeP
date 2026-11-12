'use client'

import { toastDismiss, toastNote } from '@/lib/toast'
import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { disablePush, enablePush, isBrave, pushState, type PushState } from '@/lib/push'

const BUTTON = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/80 px-2.5 py-1 max-md:min-h-11 text-[length:calc(13px*var(--ts))] font-medium hover:bg-foreground/[0.05] disabled:opacity-60'

/** What each state means, in a line. */
const SAYS: Record<PushState, string> = {
  on: 'Arrive even when Acture is closed.',
  off: 'Only when something is due.',
  blocked: 'Blocked. Allow notifications for this site in your browser.',
  'needs-install': 'On iPhone: Share → Add to Home Screen, then open it from there.',
  unsupported: 'Not supported here. They still show while Acture is open.',
}

/**
 * Settings → Notifications: whether reminders reach this device with the app
 * closed, a switch for it, and a test that sends a real one end to end.
 */
/** The result of a test, said in the island. */
function setTested(t: string | null) {
  if (!t) toastDismiss('acture-push-test')
  else toastNote('Reminders', t, 'acture-push-test', t.startsWith('Sent') ? 'success' : 'warning')
}

export function NotificationsControl() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => { void pushState().then(setState) }, [])
  useEffect(refresh, [refresh])

  const turnOn = async () => {
    setBusy(true)
    setTested(null)
    const result = await enablePush().catch(() => 'not-ready' as const)
    const brave = result === 'push-service' && (await isBrave())
    setBusy(false)
    refresh()
    if (result === 'ok' || result === 'denied') return // denied: the state line already says it is blocked
    setTested(
      brave
        ? 'Brave switches push off by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, restart Brave, then press Turn on again.'
        : result === 'push-service'
          ? 'This browser couldn’t reach its push service. Check your connection and any blockers, then try again.'
          : result === 'server'
            ? 'Acture couldn’t save this device just now. Try again in a moment.'
            : 'This browser can’t set up reminders here. They still show while Acture is open.',
    )
  }
  const turnOff = async () => { setBusy(true); await disablePush(); setBusy(false); refresh() }
  const test = async () => {
    setBusy(true)
    const res = await fetch('/api/push/test', { method: 'POST' }).then((r) => r.json() as Promise<{ sent: number }>).catch(() => null)
    setBusy(false)
    setTested(res && res.sent > 0 ? `Sent to ${res.sent} device${res.sent > 1 ? 's' : ''}. It should be on your screen now.` : 'Nothing was sent: no device has reminders on.')
  }

  if (!state) return <p className="text-[length:calc(13px*var(--ts))] text-muted-foreground">Checking this device…</p>
  const on = state === 'on'
  return (
    <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3">
      {/* Asking for the key: reminders need the browser's permission, and Tuck asks nicely. */}
      {state === 'off' && <Tuck state="permission-key" size={120} alt="Tuck holding up a key" className="shrink-0 max-sm:-ml-2" />}
      <div className="w-full min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[length:calc(15px*var(--ts))] font-semibold">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-emerald-500' : 'bg-foreground/25'}`} aria-hidden />
          {on ? 'Reminders are on' : state === 'off' ? 'May I send you reminders?' : 'Reminders'}
        </p>
        <p className="mt-1 text-[length:calc(13px*var(--ts))] text-muted-foreground">
          {SAYS[state]}
        </p>
        {(state === 'off' || on) && (
          <div className={`mt-3 grid gap-2 ${on ? 'grid-cols-2' : 'grid-cols-1 sm:max-w-[16rem]'}`}>
            {state === 'off' && <button onClick={turnOn} disabled={busy} className={`${BUTTON} justify-center`}><Bell className="w-3.5 h-3.5" />Turn on</button>}
            {on && (
              <>
                <button onClick={test} disabled={busy} className={`${BUTTON} justify-center`}><Send className="w-3.5 h-3.5" />Send a test</button>
                <button onClick={turnOff} disabled={busy} className={`${BUTTON} justify-center`}><BellOff className="w-3.5 h-3.5" />Turn off</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
