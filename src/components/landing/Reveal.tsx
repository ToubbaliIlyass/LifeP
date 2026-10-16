'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Fades a block up as it comes into view, once. Watched with an
 * IntersectionObserver, never a scroll listener, so a long page costs nothing
 * while it is being read. Already visible to anyone who asked for less motion.
 */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }: {
  children: React.ReactNode
  className?: string
  /** Milliseconds, for a row of items that should arrive one after another. */
  delay?: number
  as?: 'div' | 'section' | 'li'
}) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Less motion asked for: the CSS below shows it as it is, with nothing to wait for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] ${shown ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-8 blur-sm opacity-0'} motion-reduce:translate-y-0 motion-reduce:blur-0 motion-reduce:opacity-100 motion-reduce:transition-none ${className}`}
    >
      {children}
    </Tag>
  )
}
