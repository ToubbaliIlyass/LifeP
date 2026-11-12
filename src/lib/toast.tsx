'use client'

import type { ReactNode } from 'react'
import { sileo, type SileoOptions } from 'sileo'
import { Tuck } from '@/components/ui/Tuck'
import { playToast } from '@/lib/toast-sound'
import type { TuckState } from '@/lib/tuck/states'

/**
 * The one way the app tells you something happened: a dark island pill with
 * Tuck in it. What a toast *is* is its tone, and the tone sets both the
 * colour and Tuck's pose:
 *
 *   success  green   done, added, ticked
 *   info     blue    a plain word, a skip, offline
 *   action   violet  something new that wants a look
 *   warning  red     a reminder, a heads-up
 *   error    red     it did not work
 *   loading  grey    still working
 *
 * Call sites say what they mean; timing and look are decided here.
 */
export type Tone = 'success' | 'info' | 'action' | 'warning' | 'error' | 'loading'

/** Sileo reads `id` at runtime (same id replaces, not stacks) but its published types leave it out. */
type Opts = SileoOptions & { id?: string }

const POSE: Record<Tone, TuckState> = {
  success: 'confirmed',
  info: 'looking',
  action: 'curious',
  warning: 'nudge',
  error: 'error',
  loading: 'syncing',
}

/** Long enough to read the line and still reach Undo; the pill folds itself away two seconds before this. */
const UNDO_MS = 10_000
const NOTE_MS = 5_000

const tuck = (pose: TuckState, size = 44): ReactNode => <Tuck state={pose} size={size} decorative animate={false} className="acture-island-tuck" />

/** A header icon that is nothing: Sileo falls back to its own glyph for null, so this stands in and CSS hides its badge. */
const NO_ICON = <i data-no-icon aria-hidden />

/**
 * Tuck is the face of every word. With a body, he stands big beside it and
 * the header is just the title in the tone's colour; with none (a bare
 * "Taken back."), a little one sits in the header so he is never missing.
 */
/*
 * When a toast goes away is decided here, not by Sileo. Sileo pauses a toast
 * while it is hovered and then starts its whole timer again on leaving, so a
 * toast you had touched lived another ten seconds (a tap on a phone counts as
 * a hover). Here the deadline is fixed when the toast appears; touching it
 * only holds it while you are on it, and once you let go it is gone within
 * LEAVE_MAX_MS, and never later than it would have been untouched.
 */
const LEAVE_MIN_MS = 1200
const LEAVE_MAX_MS = 3000
const deadlines = new Map<string, number>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let held = false
let listening = false

function disarm(id: string) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

function arm(id: string, ms: number) {
  disarm(id)
  timers.set(id, setTimeout(() => { timers.delete(id); deadlines.delete(id); sileo.dismiss(id) }, ms))
}

function hold() {
  if (held) return
  held = true
  for (const id of [...timers.keys()]) disarm(id)
}

function release() {
  if (!held) return
  held = false
  const now = Date.now()
  for (const [id, at] of deadlines) arm(id, Math.min(LEAVE_MAX_MS, Math.max(LEAVE_MIN_MS, at - now)))
}

function listen() {
  if (listening || typeof document === 'undefined') return
  listening = true
  const toastOf = (n: EventTarget | null) => (n instanceof Element ? n.closest('[data-sileo-toast]') : null)
  document.addEventListener('pointerover', (e) => { if (toastOf(e.target) && !toastOf(e.relatedTarget)) hold() })
  document.addEventListener('pointerout', (e) => { if (toastOf(e.target) && !toastOf(e.relatedTarget)) release() })
  // A touch that ends off the screen or is cancelled sends no "out": let go anyway.
  document.addEventListener('pointercancel', release)
}

function show(tone: Tone, o: Opts & { pose?: TuckState; bare?: boolean; sound?: boolean }) {
  const { pose, bare, sound, ...rest } = o
  if (sound !== false) playToast(tone)
  const p = pose ?? POSE[tone]
  const hasBody = o.description !== undefined && o.description !== null && o.description !== ''
  // A short one-liner with nothing under it gets a smaller Tuck, so the bubble
  // fits its words instead of being as tall as the big Tuck needs.
  const compact = typeof o.description === 'string' && o.description.length <= 44 && !o.button
  const description = hasBody && !bare
    ? <div className="acture-body" data-compact={compact ? 'true' : undefined}>{tuck(p, compact ? 84 : 104)}<div className="acture-body-text">{o.description}</div></div>
    : o.description
  const ms = o.duration
  // duration: null, so Sileo never dismisses; the timer above does.
  const id = sileo.show({ ...rest, duration: null, description, type: tone, icon: hasBody ? NO_ICON : tuck(p, 30) } as Opts)
  if (ms) {
    listen()
    deadlines.set(id, Date.now() + ms)
    if (!held) arm(id, ms)
  } else {
    deadlines.delete(id)
    disarm(id)
  }
  return id
}

/** "Added: Call mum" with the way back. Same id replaces the previous one instead of stacking. */
export function toastUndo(title: string, detail: string, undo: () => void, id = 'acture-undo', tone: Tone = 'success', pose?: TuckState) {
  return show(tone, {
    id, title, description: detail, duration: UNDO_MS, pose,
    // Undo is always red, whatever the toast's own tone: it is the one button that takes something back.
    styles: { button: 'acture-undo-btn' },
    button: { title: 'Undo', onClick: () => { sileo.dismiss(id); undo() } },
  })
}

/** A line with nothing to undo. */
export function toastNote(title: string, detail?: string, id = 'acture-note', tone: Tone = 'info', pose?: TuckState) {
  return show(tone, { id, title, description: detail, duration: NOTE_MS, pose })
}

export const toastError = (title: string, detail?: string, id = 'acture-error') => toastNote(title, detail, id, 'error')

/** What Tuck says: the tone's short word as the title, Tuck's own line as the body. */
const WORD: Record<Tone, string> = { success: 'Nice', info: 'Tuck', action: 'Something new', warning: 'Heads up', error: 'Oops', loading: 'One moment' }

export function toneForPose(pose: TuckState): Tone {
  switch (pose) {
    case 'error': return 'error'
    case 'nudge': case 'overwhelmed-support': case 'stuck-helper': return 'warning'
    case 'curious': case 'proposing': return 'action'
    case 'syncing': case 'loading-1': case 'loading-2': case 'loading-3': case 'loading-4': return 'loading'
    case 'confirmed': case 'task-done': case 'all-done': case 'milestone': case 'streak': case 'celebrating': case 'accepted': case 'found': case 'level-seed': case 'level-sprout': case 'level-bloom': return 'success'
    default: return 'info'
  }
}

/** One of Tuck's words, with its pose, in the tone the pose means. */
export function toastTuck(line: string, o: { pose: TuckState; chip?: { text: string; color: string }; action?: { label: string; run: () => void; undo?: boolean }; id?: string; ms?: number }) {
  const id = o.id ?? 'acture-tuck'
  const tone = toneForPose(o.pose)
  // Long enough to reach an Undo when there is one.
  const ms = o.ms ?? (o.action?.undo ? 8000 : 4200)
  const body = o.chip
    ? <>{line}<span className="acture-chip"><i style={{ background: o.chip.color }} />{o.chip.text}</span></>
    : line
  return show(tone, {
    id, title: WORD[tone], description: body, duration: ms, pose: o.pose,
    autopilot: { expand: 150, collapse: Math.max(1200, ms - 700) },
    styles: o.action?.undo ? { button: 'acture-undo-btn' } : undefined,
    button: o.action ? { title: o.action.label, onClick: () => { sileo.dismiss(id); o.action?.run() } } : undefined,
  })
}

/** A tip from the bank (src/lib/tips.ts): Tuck explaining, with the tip's own action as the button. Rare, and it goes by itself. */
export function toastTip(tip: { title: string; body: string }, action?: { label: string; run: () => void }) {
  const id = 'acture-tip'
  const ms = 14_000
  return show('info', {
    id, title: tip.title, description: tip.body, duration: ms, pose: 'explaining',
    autopilot: { expand: 500, collapse: ms - 1500 },
    button: action ? { title: action.label, onClick: () => { sileo.dismiss(id); action.run() } } : undefined,
  })
}

/** Stays for as long as it is true (offline, saving): drop it with `toastDismiss` when it is not. */
export function toastStanding(id: string, pose: TuckState, line: string) {
  const tone = toneForPose(pose)
  return show(tone, { id, title: WORD[tone], description: line, duration: null, pose, sound: false, autopilot: { expand: 150, collapse: 60_000 } })
}

/** A reminder: red, stays until you answer it. `actions` are small tap targets under the line. */
export function toastReminder(id: string, title: string, body: string, actions: { label: string; primary?: boolean; run: () => void }[]) {
  const away = () => sileo.dismiss(id)
  const row = (
    // Taps here must not start the toast's own swipe-to-dismiss.
    <div className="acture-toast-actions" onPointerDown={(e) => e.stopPropagation()}>
      <div className="acture-body">{tuck('nudge', 96)}<span className="acture-toast-body">{body}</span></div>
      <div>
        {actions.map((a) => (
          <span key={a.label} role="button" tabIndex={0} data-primary={a.primary ? 'true' : undefined}
            onClick={() => { away(); a.run() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); away(); a.run() } }}>{a.label}</span>
        ))}
        <span role="button" tabIndex={0} onClick={away} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') away() }}>Put away</span>
      </div>
    </div>
  )
  return show('warning', { id, title, description: row, bare: true, duration: null, pose: 'nudge', autopilot: { expand: 150, collapse: 10 * 60_000 } })
}

export const toastDismiss = (id: string) => sileo.dismiss(id)
