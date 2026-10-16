'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Check, Download, Laptop, Smartphone } from 'lucide-react'

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

async function install() {
  if (!offer) return
  const e = offer
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') { offer = null; installedNow = true }
  emit()
}

const DEVICES: { id: Exclude<Platform, 'other'>; name: string; Icon: typeof Laptop; steps: React.ReactNode[] }[] = [
  {
    id: 'mac',
    name: 'Mac',
    Icon: Laptop,
    steps: [
      <>In <b>Chrome</b> or <b>Edge</b>: press <b>Install</b> above, or the install icon at the end of the address bar.</>,
      <>In <b>Safari</b>: <b>File</b> → <b>Add to Dock</b>.</>,
      <>It opens in its own window, in the Dock and Launchpad.</>,
    ],
  },
  {
    id: 'iphone',
    name: 'iPhone & iPad',
    Icon: Smartphone,
    steps: [
      <>Open this page in <b>Safari</b> and tap <b>Share</b>.</>,
      <>Scroll down and tap <b>Add to Home Screen</b>.</>,
      <>Open Acture from your home screen: full screen, no browser around it.</>,
    ],
  },
  {
    id: 'android',
    name: 'Android',
    Icon: Smartphone,
    steps: [
      <>In <b>Chrome</b>: tap <b>Install</b> above, or when it offers.</>,
      <>Or open the <b>⋮</b> menu and tap <b>Install app</b>.</>,
      <>It sits with your other apps, and opens straight to your lists.</>,
    ],
  },
]

const CTA = 'inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-base font-semibold text-background transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** The one action that fits this visitor: install, open, or "follow the steps below". */
export function InstallButton({ className = '' }: { className?: string }) {
  const s = useInstall()
  if (s?.installed) {
    return (
      <Link href="/app" className={`${CTA} ${className}`}>
        <Check className="w-4 h-4" /> Installed — open Acture
      </Link>
    )
  }
  if (s?.canPrompt) {
    return (
      <button onClick={install} className={`${CTA} ${className}`}>
        <Download className="w-4 h-4" /> Install Acture
      </button>
    )
  }
  // No offer to act on (Safari, or the browser has not made up its mind):
  // say where the steps are for this device.
  const here = DEVICES.find((d) => d.id === s?.platform)
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      {here ? <>On your {here.name}: follow the steps {s?.platform === 'mac' && s.safari ? 'for Safari ' : ''}below.</> : 'Install it from Chrome or Edge, or follow the steps below.'}
    </p>
  )
}

/** The landing page's "on every device" section. */
export function InstallSection() {
  const s = useInstall()
  return (
    <div className="w-full">
      <div className="flex justify-center">
        <InstallButton />
      </div>
      <ul className="mt-10 grid gap-4 text-left md:grid-cols-3">
        {DEVICES.map(({ id, name, Icon, steps }) => {
          const here = s?.platform === id
          return (
            <li
              key={id}
              // This visitor's own device first: on a phone that is the card
              // they need, and the others are for later.
              className={`rounded-2xl border p-5 transition-colors ${here ? 'order-first border-foreground/25 bg-card shadow-[0_8px_32px_rgb(0_0_0/0.06)]' : 'border-border bg-card/60'}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-foreground/[0.06]">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <h3 className="flex-1 text-base font-semibold">{name}</h3>
                {here && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">This device</span>}
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-foreground/75">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-px grid shrink-0 place-items-center w-5 h-5 rounded-full bg-foreground/[0.07] text-[11px] font-semibold tabular-nums text-foreground/70">{i + 1}</span>
                    <span className="[text-wrap:pretty]">{step}</span>
                  </li>
                ))}
              </ol>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
