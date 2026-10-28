'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05] disabled:opacity-60'

/** What each state means, in a line. */
const SAYS: Record<PushState, string> = {
  on: 'On for this device. Reminders arrive even when Acture is closed.',
  off: 'Off for this device. Reminders only show while Acture is open.',
  blocked: 'Blocked in this browser’s settings. Allow notifications for this site, then come back.',
  'needs-install': 'On iPhone and iPad, reminders arrive in the app added to the Home Screen: Share → Add to Home Screen, then open it from there.',
  unsupported: 'This browser can’t receive reminders while Acture is closed. They still show while it’s open.',
}

/**
 * Settings → Notifications: whether reminders reach this device with the app
 * closed, a switch for it, and a test that sends a real one end to end.
 */
export function NotificationsControl() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [tested, setTested] = useState<string | null>(null)
  const refresh = useCallback(() => { void pushState().then(setState) }, [])
  useEffect(refresh, [refresh])

  const turnOn = async () => {
    setBusy(true)
    const ok = await enablePush().catch(() => false)
    setBusy(false)
    refresh()
    if (!ok) setTested(Notification.permission === 'denied' ? null : 'Couldn’t turn them on here. Try again, or check this browser’s notification settings.')
  }
  const turnOff = async () => { setBusy(true); await disablePush(); setBusy(false); refresh() }
  const test = async () => {
    setBusy(true)
    const res = await fetch('/api/push/test', { method: 'POST' }).then((r) => r.json() as Promise<{ sent: number }>).catch(() => null)
    setBusy(false)
    setTested(res && res.sent > 0 ? `Sent to ${res.sent} device${res.sent > 1 ? 's' : ''}. It should be on your screen now.` : 'Nothing was sent: no device has reminders on.')
  }

  if (!state) return <p className="text-[13px] text-muted-foreground">Checking this device…</p>
  return (
    <div className="flex items-start gap-3">
      {/* Asking for the key: reminders need the browser's permission, and Tuck asks nicely. */}
      {state === 'off' && <Tuck state="permission-key" size={92} alt="Tuck holding up a key" className="-mt-2 max-sm:hidden" />}
    <div className="space-y-2.5 min-w-0">
      {state === 'off' && <p className="text-[13.5px] font-medium">May I send you reminders? Only when something is due.</p>}
      <p className="text-[13.5px]">{SAYS[state]}</p>
      <div className="flex flex-wrap gap-2">
        {state === 'off' && <button onClick={turnOn} disabled={busy} className={BUTTON}><Bell className="w-3.5 h-3.5" />Turn on</button>}
        {state === 'on' && (
          <>
            <button onClick={test} disabled={busy} className={BUTTON}><Send className="w-3.5 h-3.5" />Send a test</button>
            <button onClick={turnOff} disabled={busy} className={BUTTON}><BellOff className="w-3.5 h-3.5" />Turn off</button>
          </>
        )}
      </div>
      {tested && <p className="text-[12.5px] text-muted-foreground" role="status">{tested}</p>}
    </div>
    </div>
  )
}
