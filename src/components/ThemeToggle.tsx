'use client'

import { useEffect, useState } from 'react'

interface ThemeToggleProps {
  /** When true, renders as a full sidebar row with icon + label */
  sidebar?: boolean
  collapsed?: boolean
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  )
}

export function ThemeToggle({ sidebar = false, collapsed = false }: ThemeToggleProps) {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return stored ? stored === 'dark' : prefersDark
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  function toggle() {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  if (sidebar) {
    return (
      <button
        onClick={toggle}
        title={collapsed ? (dark ? 'Light mode' : 'Dark mode') : undefined}
        className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${
          collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'
        }`}
      >
        {dark
          ? <SunIcon className={`shrink-0 opacity-55 ${collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
          : <MoonIcon className={`shrink-0 opacity-55 ${collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
        }
        {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
      aria-label="Toggle dark mode"
    >
      {dark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
    </button>
  )
}
