'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Whether an element has come into view yet — once, then it stays true.
 * An IntersectionObserver, never a scroll listener. With less motion asked
 * for, it is simply true: the finished picture, nothing to wait for.
 */
export function useInView<T extends Element>(margin = '-15%') {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(([entry]) => {
      if (reduce || entry.isIntersecting) { setSeen(true); io.disconnect() }
    }, { rootMargin: `0px 0px ${margin} 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [margin])
  return { ref, seen }
}

/** The page's one easing: heavy, then settled. */
export const EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]'
