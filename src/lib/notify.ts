'use client'

import { enablePush, pushIsOn } from '@/lib/push'

/**
 * Asking to be allowed to remind. Called the moment someone sets a
 * reminder — the one time the question makes sense — and never on load.
 * Where it can, it turns on push too, so the reminder arrives even with
 * Acture closed (src/lib/push.ts); Settings has the switch for it.
 */
export function askForNotifications() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'denied') return
  if (Notification.permission === 'granted' && pushIsOn()) return
  void enablePush().catch(() => {})
}
