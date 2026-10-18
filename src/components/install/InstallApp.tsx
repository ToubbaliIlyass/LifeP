'use client'

import { useSyncExternalStore } from 'react'

/*
 * Installing Acture: it is a web app with a manifest (src/app/manifest.ts),
 * so it installs from the browser — no store. How depends on where you are:
 *
 *   Chrome, Edge, Android  the browser offers it, and a button here can ask
 *                          (the `beforeinstallprompt` event)
 *   Safari on a Mac        File → Add to Dock
 *   iPhone                 Share → Add to Home Screen
 *
 * The browser's offer can arrive before React does, so it is caught here at
 * module level and kept until a button asks for it.
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let offer: InstallEvent | null = null
let installedNow = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // ours to show, not a mini-infobar
    offer = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    installedNow = true
    emit()
  })
}

type Platform = 'mac' | 'iphone' | 'android' | 'other'

interface InstallState {
  platform: Platform
  /** Safari, which never offers the install button. */
  safari: boolean
  /** Running as the installed app, or just installed from here. */
  installed: boolean
  /** The browser has offered to install: one press does it. */
  canPrompt: boolean
}

function detect(): InstallState {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const platform: Platform = iphone ? 'iphone' : /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : 'other'
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    platform,
    safari: /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|FxiOS|Android/.test(ua),
    installed: standalone || installedNow,
    canPrompt: offer !== null,
  }
}

// useSyncExternalStore wants the same object back while nothing changed.
let cached: InstallState | null = null
let cacheKey = ''
function snapshot(): InstallState {
  const next = detect()
  const key = JSON.stringify(next)
  if (key !== cacheKey) { cached = next; cacheKey = key }
  return cached!
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Where this visitor is, and what installing means there. `null` on the server. */
export function useInstall(): InstallState | null {
  return useSyncExternalStore(subscribe, snapshot, () => null)
}

/** Asks the browser to install Acture, when it has offered to. */
export async function install() {
  if (!offer) return
  const e = offer
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') { offer = null; installedNow = true }
  emit()
}
