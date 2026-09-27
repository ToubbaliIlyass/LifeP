'use client'

import { Moon, Sun } from 'lucide-react'
import { useMode } from '@/lib/useMode'

interface ThemeToggleProps {
  /** When true, renders as a full sidebar row with icon + label */
  sidebar?: boolean
  collapsed?: boolean
}

/**
 * Switches light and dark.
 *
 * Shows the mode you are *in*, not the one you would switch to. It used to
 * do the opposite, which meant that in dark mode the sidebar read "Light
 * mode" with a sun while the Settings picker two panels away highlighted
 * "dark" with a moon — both correct, and flatly contradictory to look at.
 * The two say the same thing now, in the same icons; what pressing it does
 * is in the tooltip, where an action label belongs.
 */
export function ThemeToggle({ sidebar = false, collapsed = false }: ThemeToggleProps) {
  // Shared with the Settings picker, so the two can never show different
  // answers while both are on screen — see src/lib/useMode.ts.
  const { dark, toggle } = useMode()

  const Icon = dark ? Moon : Sun
  const label = dark ? 'Dark mode' : 'Light mode'
  const action = dark ? 'Switch to light mode' : 'Switch to dark mode'

  if (sidebar) {
    return (
      <button
        onClick={toggle}
        title={action}
        aria-label={action}
        className={`flex items-center rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors w-full ${
          collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-left'
        }`}
      >
        <Icon className={`shrink-0 opacity-55 ${collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]'}`} />
        {!collapsed && label}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
      title={action}
      aria-label={action}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
