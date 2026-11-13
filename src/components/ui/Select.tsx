'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption { value: string; label: string }

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  /** Shown before the value, inside the button. */
  icon?: React.ReactNode
  className?: string
}

/**
 * A dropdown that looks like the rest of the app. The browser's own list can't be
 * styled, so this draws one: a button that opens a themed list, with the arrow keys,
 * Enter, Escape and type-ahead a native select would have. The list is drawn on the
 * body so no scrolling parent clips it, and flips upward near the bottom of the screen.
 */
export function Select({ value, options, onChange, ariaLabel, icon, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()
  const selected = options.findIndex((o) => o.value === value)

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 220 && above > below
    setBox(up
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, max: Math.min(320, above) }
      : { left: r.left, width: r.width, top: r.bottom + 6, max: Math.min(320, below) })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, place])

  // Close on a press anywhere else.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  // Keep the highlighted row in view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active, box])

  const show = () => { setActive(Math.max(0, selected)); setOpen(true) }
  const choose = (i: number) => { onChange(options[i].value); setOpen(false); button.current?.focus() }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
    else if (e.key === 'Tab') setOpen(false)
    else if (e.key.length === 1) {
      const now = Date.now()
      typed.current.text = (now - typed.current.at > 700 ? '' : typed.current.text) + e.key.toLowerCase()
      typed.current.at = now
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`flex w-full items-center gap-2 text-left transition hover:bg-foreground/[0.08] ${className}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{options[selected]?.label ?? ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && box && createPortal(
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={ariaLabel}
          style={{ left: box.left, minWidth: box.width, top: box.top, bottom: box.bottom, maxHeight: box.max }}
          className="fixed z-[80] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[0_12px_32px_-8px_rgb(0_0_0/0.28)]"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 max-md:min-h-11 text-[length:calc(13.5px*var(--ts))] ${i === active ? 'bg-foreground/[0.07]' : ''} ${i === selected ? 'font-semibold' : ''}`}
            >
              <span className="min-w-0 flex-1">{o.label}</span>
              {i === selected && <Check className="h-4 w-4 shrink-0 text-primary-ink" strokeWidth={2.5} />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
