import { safeGet, safeSet } from '@/lib/storage'

/**
 * Palettes layered on top of light/dark mode.
 *
 * A theme is not a replacement for the mode — every palette supplies both a
 * light and a dark ground, which is why they all share Frosted Mint and Jet
 * Black. Switching palette keeps whichever mode the user is in.
 *
 * The swatches here are for the picker only; the actual colours are applied
 * as CSS custom properties in globals.css, keyed off `data-theme`.
 */
export interface ThemeDef {
  id: string
  name: string
  /** What the picker shows: primary, secondary, then the two shared grounds. */
  swatch: [string, string, string, string]
  description: string
}

export const THEMES: ThemeDef[] = [
  {
    id: 'default',
    name: 'Default',
    swatch: ['#bd8b2c', '#3f3f46', '#fcfdfa', '#141415'],
    description: 'The original warm neutral.',
  },
  {
    id: 'toffee',
    name: 'Toffee',
    swatch: ['#9e6240', '#dea47e', '#faf3ec', '#13262f'],
    description: 'Toffee brown and bronze, on warm sand.',
  },
  {
    id: 'grove',
    name: 'Grove',
    swatch: ['#f9a620', '#548c2f', '#e9fde6', '#13262f'],
    description: 'Orange against forest green, on mint.',
  },
  {
    id: 'coral',
    name: 'Coral',
    swatch: ['#ff8552', '#a31621', '#fff4ef', '#13262f'],
    description: 'Coral glow and ruby, on warm blush.',
  },
  {
    id: 'ember',
    name: 'Ember',
    swatch: ['#faa916', '#96031a', '#fef8ea', '#13262f'],
    description: 'Amber and deep crimson, on cream.',
  },
  {
    id: 'tide',
    name: 'Tide',
    swatch: ['#1d5f8a', '#17879a', '#eef4f8', '#0e1c26'],
    description: 'Deep blue and teal, on cool mist.',
  },
  {
    id: 'orchid',
    name: 'Orchid',
    swatch: ['#6b3fa0', '#b0327f', '#f5f1f8', '#1a1220'],
    description: 'Plum and magenta, on pale lilac.',
  },
  {
    id: 'moss',
    name: 'Moss',
    swatch: ['#2f6b45', '#7a8b3a', '#f0f4ec', '#131a12'],
    description: 'Forest and olive, on pale sage.',
  },
  {
    id: 'slate',
    name: 'Slate',
    swatch: ['#27272a', '#a1a1aa', '#f4f4f5', '#161618'],
    description: 'No colour at all, for when it distracts.',
  },
]

export const THEME_STORAGE_KEY = 'acture-theme'

/*
 * Light/dark mode.
 *
 * Separate from the palette, and stored under its own key. Three states, not
 * two: "not chosen" has to be distinguishable from "chose light", or an
 * explicit light choice cannot survive a machine whose OS prefers dark —
 * which is exactly what went wrong. Absent means `system`, so the existing
 * 'light'/'dark' values keep working untouched.
 *
 * The rule below is mirrored by the pre-paint script in src/app/layout.tsx,
 * which cannot import anything. If it changes here, change it there: the two
 * disagreeing is what left the page dark while the toggle claimed light.
 */
export const MODE_STORAGE_KEY = 'theme'

export type Mode = 'light' | 'dark' | 'system'

export function isMode(value: string | null | undefined): value is Mode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function storedMode(): Mode {
  const stored = safeGet('local', MODE_STORAGE_KEY)
  return isMode(stored) ? stored : 'system'
}

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Whether a mode means dark right now. Only `system` depends on the OS. */
export function isDark(mode: Mode): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark())
}

/** Applies a mode to the document and remembers it for the next load. */
export function applyMode(mode: Mode) {
  document.documentElement.classList.toggle('dark', isDark(mode))
  safeSet('local', MODE_STORAGE_KEY, mode)
}

export function isTheme(id: string | null | undefined): boolean {
  return !!id && THEMES.some((t) => t.id === id)
}

/** Applies a palette to the document and remembers it for the next load. */
export function applyTheme(id: string) {
  const root = document.documentElement
  if (id === 'default') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
  safeSet('local', THEME_STORAGE_KEY, id)
}

export function storedTheme(): string {
  const stored = safeGet('local', THEME_STORAGE_KEY)
  return isTheme(stored) ? (stored as string) : 'default'
}
