'use client'

import { safeGet, safeSet } from '@/lib/storage'
import type { Tone } from '@/lib/toast'

/**
 * The little sound a toast makes: a soft chime made on the spot with the Web
 * Audio API (no files to load), a different phrase for each tone so you can
 * tell a reminder from a success without looking. Quiet on purpose, never
 * more than one at a time, and it can be turned off in Settings.
 *
 * Browsers keep audio locked until the page has been touched once, so a toast
 * that appears before any tap is silent rather than an error.
 */
const KEY = 'acture-sound'

export const soundOn = () => safeGet('local', KEY) !== '0'
export const setSoundOn = (on: boolean) => safeSet('local', KEY, on ? '1' : '0')

/** [pitch in Hz, start in s, length in s] */
type Note = readonly [number, number, number]
const SCORES: Partial<Record<Tone, readonly Note[]>> = {
  success: [[659, 0, 0.14], [988, 0.09, 0.24]],                       // E5 up to B5: done
  info: [[784, 0, 0.18]],                                             // G5: a plain word
  action: [[784, 0, 0.1], [1047, 0.07, 0.1], [1319, 0.14, 0.22]],     // rising: something new
  warning: [[880, 0, 0.16], [659, 0.2, 0.16], [880, 0.4, 0.26]],      // two-tone: a reminder
  error: [[330, 0, 0.14], [247, 0.13, 0.28]],                         // falling: it did not work
}

const LEVEL = 0.07
let ctx: AudioContext | null = null
let last = 0

export function playToast(tone: Tone) {
  if (typeof window === 'undefined' || document.visibilityState !== 'visible' || !soundOn()) return
  const score = SCORES[tone]
  if (!score) return
  const now = Date.now()
  if (now - last < 250) return
  last = now
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    if (ctx.state !== 'running') return
    const t0 = ctx.currentTime
    for (const [freq, at, len] of score) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(LEVEL, t0 + at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + len + 0.03)
    }
  } catch { /* no audio on this device: the toast is the message */ }
}
