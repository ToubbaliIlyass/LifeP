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

/** A palette made from one colour the user picked: `custom:#rrggbb`. */
export const CUSTOM_PREFIX = 'custom:'
export const CUSTOM_CSS_KEY = 'acture-custom-css'
const HEX = /^#[0-9a-f]{6}$/i

export function isCustomTheme(id: string | null | undefined): id is string {
  return !!id && id.startsWith(CUSTOM_PREFIX) && HEX.test(id.slice(CUSTOM_PREFIX.length))
}
export const customHex = (id: string) => id.slice(CUSTOM_PREFIX.length).toLowerCase()

export function isTheme(id: string | null | undefined): boolean {
  return !!id && (THEMES.some((t) => t.id === id) || isCustomTheme(id))
}

/** Hex to OKLCH (lightness 0-1, chroma, hue in degrees). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = v.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(bb, a) * 180) / Math.PI
  return { l: L, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h }
}

/**
 * The whole palette, light and dark, from one colour. Hue and chroma come from
 * the pick; lightness is held where text on the main button and on the page
 * stays readable, so no pick can make the app hard to read.
 */
export function customThemeCss(id: string): string {
  const { l, c, h } = hexToOklch(customHex(id))
  const H = h.toFixed(1)
  const C = Math.min(c, 0.17)
  const tint = Math.min(0.012, C * 0.15)
  const t = (k: number) => (tint * k).toFixed(4)
  const lp = Math.min(0.56, Math.max(0.4, l)).toFixed(3)
  const ld = Math.min(0.8, Math.max(0.7, l)).toFixed(3)
  const ok = (L: number, ch: string, a = '') => `oklch(${L} ${ch} ${H}${a})`
  const shared = (primary: string, onPrimary: string, fg: string) => `
  --primary: ${primary}; --primary-foreground: ${onPrimary};
  --sidebar-primary: ${primary}; --sidebar-primary-foreground: ${onPrimary};
  --ring: ${primary}; --sidebar-ring: ${primary}; --chart-1: ${primary};
  --foreground: ${fg}; --card-foreground: ${fg}; --popover-foreground: ${fg};
  --sidebar-foreground: ${fg}; --secondary-foreground: ${fg}; --accent-foreground: ${fg};
  --sidebar-accent-foreground: ${fg};`
  const light = `[data-theme='custom'] {${shared(ok(+lp, C.toFixed(4)), ok(0.985, t(0.5)), ok(0.2, t(1.5)))}
  --background: ${ok(0.985, t(1))}; --card: ${ok(0.993, t(0.5))}; --popover: ${ok(0.993, t(0.5))};
  --sidebar: color-mix(in oklab, var(--background) 96%, black);
  --muted: ${ok(0.94, t(2))}; --muted-foreground: ${ok(0.45, t(3))};
  --secondary: ${ok(0.93, t(2.5))}; --accent: ${ok(0.93, t(2.5))}; --sidebar-accent: ${ok(0.93, t(2.5))};
  --border: ${ok(0.2, t(1.5), ' / 14%')}; --input: ${ok(0.2, t(1.5), ' / 18%')}; --sidebar-border: ${ok(0.2, t(1.5), ' / 14%')};
}`
  const dark = `.dark[data-theme='custom'] {${shared(ok(+ld, C.toFixed(4)), ok(0.2, t(2)), ok(0.96, t(0.6)))}
  --background: ${ok(0.19, t(1.2))}; --sidebar: ${ok(0.155, t(1.2))}; --card: ${ok(0.235, t(1.2))}; --popover: ${ok(0.235, t(1.2))};
  --muted: ${ok(0.28, t(1.4))}; --muted-foreground: ${ok(0.96, t(0.6), ' / 66%')};
  --secondary: ${ok(0.28, t(1.4))}; --accent: ${ok(0.31, t(1.4))}; --sidebar-accent: ${ok(0.31, t(1.4))};
  --border: ${ok(0.96, t(0.6), ' / 14%')}; --input: ${ok(0.96, t(0.6), ' / 17%')}; --sidebar-border: ${ok(0.96, t(0.6), ' / 14%')};
}`
  return `${light}\n${dark}`
}

/** Applies a palette to the document and remembers it for the next load. */
export function applyTheme(id: string) {
  const root = document.documentElement
  let style = document.getElementById('acture-custom-theme')
  if (isCustomTheme(id)) {
    const css = customThemeCss(id)
    if (!style) { style = document.createElement('style'); style.id = 'acture-custom-theme'; document.head.appendChild(style) }
    style.textContent = css
    safeSet('local', CUSTOM_CSS_KEY, css)   // the pre-paint script replays this, so there is no flash
    root.setAttribute('data-theme', 'custom')
  } else {
    style?.remove()
    if (id === 'default') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', id)
  }
  safeSet('local', THEME_STORAGE_KEY, id)
}

export function storedTheme(): string {
  const stored = safeGet('local', THEME_STORAGE_KEY)
  return isTheme(stored) ? (stored as string) : 'default'
}
