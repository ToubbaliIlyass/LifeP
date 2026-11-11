'use client'

import { safeGet, safeRemove, safeSet } from '@/lib/storage'
import { wallNow } from '@/lib/wallclock'
import type { Reminder } from '@/lib/reminders'

/** Now on the user's wall clock, as reminders write it: YYYY-MM-DDTHH:MM. */
export function momentNow(): string {
  const d = wallNow(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const PUSH_KEY = 'acture-push'

/** Whether this device gets reminders pushed by the server. */
export function pushIsOn(): boolean {
  return safeGet('local', PUSH_KEY) === '1'
}

/**
 * A system notification from the page itself, for a device without push.
 * Through the service worker where there is one (Android shows nothing
 * otherwise), else the page's own Notification.
 */
export function systemNotification(r: Reminder) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body: r.body, tag: r.key, icon: '/icons/icon-192.png', data: { url: '/app' } }
  const viaWorker = 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined)
  void viaWorker.then((reg) => {
    if (reg) return reg.showNotification(r.title, options)
    new Notification(r.title, options)
  }).catch(() => { try { new Notification(r.title, options) } catch { /* nothing more to try */ } })
}

/** Where push stands on this device, for Settings to say. */
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const standalone = () => window.matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported'
  // An iPhone only delivers push to the app added to its home screen.
  if (isIOS() && !standalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Which device this is, for the list of where reminders go. */
async function deviceLabel(): Promise<string> {
  const ua = navigator.userAgent
  const os = isIOS() ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'This device'
  const browser = (await isBrave()) ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [os, browser].filter(Boolean).join(' · ')
}

/** Why turning push on did not work, so Settings can say what to do about it. */
export type PushResult = 'ok' | 'denied' | 'not-ready' | 'push-service' | 'server'

/** Brave answers this; every other browser has no `brave` object. */
export async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave
  try { return !!(await brave?.isBrave?.()) } catch { return false }
}

/**
 * Turns push on here: asks permission if it has not been given, subscribes
 * with the server's key, and tells the server where to send. Must start from
 * a tap: browsers refuse otherwise. Says why when it cannot.
 *
 * `push-service` is the browser refusing to reach its push service. Brave
 * does this by default (it ships with Google's push messaging switched off),
 * and so does any browser offline or behind a blocker.
 */
export async function enablePush(): Promise<PushResult> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'not-ready'
  if (Notification.permission === 'default' && (await Notification.requestPermission()) !== 'granted') return 'denied'
  if (Notification.permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'not-ready' // registered in production only: see RegisterServiceWorker
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  } catch {
    return 'push-service'
  }
  const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), label: await deviceLabel() }) }).catch(() => null)
  if (!res?.ok) return 'server'
  safeSet('local', PUSH_KEY, '1')
  return 'ok'
}

/** Turns push off here, on both sides. */
export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  safeRemove('local', PUSH_KEY)
}
