'use client'

import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { animate } from 'motion'
import { drawerSettles, rubberband, velocityOf, type Sample } from '@/lib/gesture'

const LOCK_PX = 10 // how far the finger moves before we decide which way it is going

type Drag = { id: number; x0: number; y0: number; base: number; locked: boolean | null; history: Sample[]; width: number }

/**
 * Swipe a phone drawer shut. The drawer follows the finger 1:1 (and the page
 * beneath shows through as it goes); on release it carries on at the speed of
 * the finger to wherever the flick was heading, on a spring that can be caught
 * again mid-flight, starting from where it visibly is, not from where it was
 * going. Vertical scrolling inside is left to the browser (`touch-action: pan-y`).
 *
 * The drawer's open/shut rest position stays the class on the element; this
 * only writes an inline transform while a drag or its settle is under way.
 */
export function useDrawerSwipe(ref: RefObject<HTMLElement | null>, open: boolean, onClose?: () => void) {
  const drag = useRef<Drag | null>(null)
  const flight = useRef<{ stop: () => void } | null>(null)

  // Whenever open changes, the class takes over again.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    flight.current?.stop(); flight.current = null
    if (!el.style.transform) return // nothing was dragged: the class does its own transition
    // After a drag the drawer is already where the class puts it, so hand over
    // without a transition (or the class would animate it again from the other side).
    el.style.transition = 'none'
    el.style.transform = ''
    void el.offsetWidth
    requestAnimationFrame(() => { el.style.transition = '' })
  }, [open, ref])

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const phone = () => window.matchMedia('(max-width: 767px)').matches

  // Where it is on screen right now (Tailwind rests it with `translate`, a drag moves it with `transform`; the rect has both).
  function currentX(el: HTMLElement) {
    return el.getBoundingClientRect().left
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    const el = ref.current
    if (!el || !open || !phone() || e.pointerType === 'mouse' || !e.isPrimary) return
    // Grab it mid-flight: stop the settle and take over from the on-screen position.
    let base = 0
    if (flight.current) { base = currentX(el); flight.current.stop(); flight.current = null }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base, locked: base !== 0 ? true : null, history: [{ x: e.clientX, t: e.timeStamp }], width: el.offsetWidth }
    if (base !== 0) { el.style.transition = 'none'; el.setPointerCapture(e.pointerId) }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const el = ref.current, d = drag.current
    if (!el || !d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0
    if (d.locked === null) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return
      // Leftward and more sideways than up/down: ours. Anything else is a scroll or a tap.
      d.locked = dx < 0 && Math.abs(dx) > Math.abs(dy)
      if (!d.locked) { drag.current = null; return }
      el.style.transition = 'none'
      el.setPointerCapture(e.pointerId)
      d.x0 = e.clientX // start tracking from here, so it does not jump by the lock distance
    }
    const raw = d.base + (e.clientX - d.x0)
    const x = raw > 0 ? rubberband(raw, d.width) : raw // soft at the open edge
    el.style.transform = `translateX(${x}px)`
    d.history.push({ x: e.clientX, t: e.timeStamp })
    if (d.history.length > 12) d.history.shift()
  }

  function end(e: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const el = ref.current, d = drag.current
    if (!el || !d || e.pointerId !== d.id) return
    drag.current = null
    if (!d.locked) return
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    const x = Math.min(0, currentX(el))
    const v = cancelled ? 0 : velocityOf(d.history)
    const target = drawerSettles(x, v, d.width)
    const to = target === 'closed' ? -d.width * 1.02 : 0
    if (reduced()) {
      el.style.transform = ''
      el.style.transition = ''
      if (target === 'closed') onClose?.()
      return
    }
    flight.current = animate(x, to, {
      type: 'spring',
      duration: 0.4,
      bounce: target === 'open' && Math.abs(v) > 300 ? 0.12 : 0, // overshoot only after a flick
      velocity: v,
      onUpdate: (n) => { el.style.transform = `translateX(${n}px)` },
      onComplete: () => {
        flight.current = null
        if (target === 'closed') onClose?.() // the layout effect hands over to the class
        else { el.style.transform = ''; el.style.transition = '' }
      },
    })
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => end(e, true),
  }
}
