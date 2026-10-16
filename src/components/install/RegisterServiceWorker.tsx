'use client'

import { useEffect } from 'react'

/**
 * Registers public/sw.js, which only stands in with an offline page when
 * there is no connection. Production only: in development it would sit
 * between the dev server and every reload.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}
