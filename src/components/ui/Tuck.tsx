'use client'

import './tuck.css'
import { useEffect, useId, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { ID_PREFIX, loadArt, peekArt } from '@/lib/tuck/art'
import { LOADING_FRAMES, TUCK_ALT, type TuckLevel, type TuckState } from '@/lib/tuck/states'

/**
 * Tuck, the gardener: a slate mole with a trowel and a sprout on its head.
 *
 * One component for every pose (see src/lib/tuck/states.ts), light or dark,
 * sized by its width. Two ways to draw it, chosen to keep it cheap:
 *
 *  - an <img> from public/tuck, both themes in the markup and the right one
 *    shown by the `.dark` class, so there is no flash and no JavaScript on
 *    the way in. Always at first, and for good when it is small or still;
 *  - the same file inlined once it has loaded, which is what lets the CSS in
 *    globals.css move the sprout, the paws and the props. Only when it is
 *    big enough for the motion to be seen and `animate` has not been turned
 *    off. Everything stands still under prefers-reduced-motion.
 *
 * The four `loading-*` poses are one loop of frames, so they stay <img>s and
 * are stepped through by CSS.
 */

export type TuckTone = 'auto' | 'light' | 'dark'

export interface TuckProps {
  state: TuckState
  /** Width in px; the height follows (the art is 320 x 300). */
  size?: number
  /** What a screen reader hears. Defaults to a description of the pose. */
  alt?: string
  /** Purely decorative, next to words that already say it: hidden from screen readers. */
  decorative?: boolean
  /** Let the CSS move it. Off for lists of many, or where it should hold still. */
  animate?: boolean
  /** `auto` follows the app's dark mode; the others pin a surface (a dark panel in a light page). */
  tone?: TuckTone
  /** Growth stage drawn on the sprout, for any pose. Leave out for the default sprout. */
  level?: TuckLevel | null
  className?: string
  style?: CSSProperties
}

/** Below this, motion is not visible and the art is not worth inlining. */
const INLINE_FROM = 44
const RATIO = 300 / 320

// ── The app's dark mode: the `dark` class on <html>, one observer for all ────
const watchers = new Set<() => void>()
let observer: MutationObserver | null = null
function subscribe(onChange: () => void) {
  watchers.add(onChange)
  if (!observer) {
    observer = new MutationObserver(() => watchers.forEach((w) => w()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }
  return () => {
    watchers.delete(onChange)
    if (watchers.size === 0) { observer?.disconnect(); observer = null }
  }
}
const isDark = () => document.documentElement.classList.contains('dark')
const useIsDark = () => useSyncExternalStore(subscribe, isDark, () => false)

const SLEEPY: readonly TuckState[] = ['deep-sleep', 'night-sleepy', 'morning-wake']

export function Tuck({ state, size = 96, alt, decorative = false, animate = true, tone = 'auto', level = null, className = '', style }: TuckProps) {
  const dark = useIsDark()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [, redraw] = useState(0)
  const looping = state.startsWith('loading-')
  const useDark = tone === 'dark' || (tone === 'auto' && dark)
  const wantsInline = animate && !looping && size >= INLINE_FROM

  const art = wantsInline ? peekArt(state, useDark, level) : null
  useEffect(() => {
    if (!wantsInline || art) return
    let live = true
    loadArt(state, useDark, level).then(() => { if (live) redraw((n) => n + 1) })
    return () => { live = false }
  }, [wantsInline, art, state, useDark, level])

  const box: CSSProperties = { width: size, height: Math.round(size * RATIO), ...style }
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': alt ?? TUCK_ALT[state] }
  const cls = `tuck ${animate ? '' : 'tuck-still'} ${className}`

  if (art) {
    return (
      <span {...a11y} className={cls} data-state={state} data-sleepy={SLEEPY.includes(state) || undefined} style={box}
        dangerouslySetInnerHTML={{ __html: art.replaceAll(ID_PREFIX, `${uid}-`) }} />
    )
  }

  // The picture before it can move, and for good where it does not need to. Both themes are in the
  // markup (unless one is pinned), so the page's own dark class picks without a flash.
  const frames = looping ? LOADING_FRAMES : [state]
  const img = (name: string, dir: 'svg' | 'svg-dark', i: number, hide: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- art that is already vector, served as it is
    <img key={`${dir}${name}`} src={`/tuck/${dir}/${name}.svg`} alt="" aria-hidden width={size} height={box.height as number}
      decoding="async" draggable={false} data-f={looping ? i : undefined} className={`tuck-img ${looping ? 'tuck-frame' : ''} ${hide}`} style={looping ? ({ '--i': i } as CSSProperties) : undefined} />
  )
  return (
    <span {...a11y} className={cls} data-state={state} style={box}>
      {frames.map((f, i) => (
        tone === 'dark' ? img(f, 'svg-dark', i, '')
          : tone === 'light' ? img(f, 'svg', i, '')
          : [img(f, 'svg', i, 'dark:hidden'), img(f, 'svg-dark', i, 'hidden dark:block')]
      ))}
    </span>
  )
}

/**
 * Tuck's head and shoulders, square: the assistant's face next to what it
 * says. Drawn for small sizes (the full poses blur below about 120px), with
 * a dark twin that carries its own rim.
 */
export function TuckAvatar({ size = 28, alt = 'Tuck', decorative = false, tone = 'auto', className = '' }: {
  size?: number
  alt?: string
  decorative?: boolean
  tone?: TuckTone
  className?: string
}) {
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': alt }
  const img = (dir: 'avatar' | 'avatar-dark', hide: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- small vector art, served as it is
    <img src={`/tuck/avatar/${dir}.svg`} alt="" aria-hidden width={size} height={size} decoding="async" draggable={false} className={`block rounded-full ${hide}`} />
  )
  return (
    <span {...a11y} className={`tuck-avatar inline-block shrink-0 leading-[0] ${className}`} style={{ width: size, height: size }}>
      {tone === 'dark' ? img('avatar-dark', '') : tone === 'light' ? img('avatar', '') : <>{img('avatar', 'dark:hidden')}{img('avatar-dark', 'hidden dark:block')}</>}
    </span>
  )
}
