/**
 * Node-type colour, from a single stored number per type.
 *
 * `settings.typeColors` holds an OKLCH *hue* (0-360) per node type and
 * nothing else. Lightness, chroma and alpha are decided here, per role and
 * per mode, which is what keeps a chosen colour usable: the app has nine
 * palettes and two modes (src/lib/themes.ts), and a stored hex would be
 * right in exactly one of them and wrong — or illegible — in the rest.
 *
 * Deliberately pure: no React, no DOM, no fetching. Both views render the
 * same generated custom properties from this file, so a type cannot end up
 * one colour on the calendar and another in the graph.
 */

/** Node type (lower-cased) → OKLCH hue in degrees. The stored shape. */
export type TypeColors = Record<string, number>

/**
 * What a colour is used for. One hue, six jobs, because a calendar block's
 * wash and a graph circle's fill cannot be the same colour and still read.
 *
 *   bg      calendar block wash, over the grid
 *   border  the block's leading edge, a graph circle's rim
 *   text    a label printed on top of `bg`/`soft`
 *   glow    the graph's outer halo
 *   fill    a graph leaf circle, which is small and needs to be solid
 *   soft    a graph category circle, which holds text
 */
export type Role = 'bg' | 'border' | 'text' | 'glow' | 'fill' | 'soft'

export const ROLES: readonly Role[] = ['bg', 'border', 'text', 'glow', 'fill', 'soft'] as const

interface Recipe {
  l: number
  c: number
  /** Omitted means opaque. */
  a?: number
  /** Whether the yellow correction below applies. Never to text. */
  lift?: boolean
}

/*
 * The two recipes.
 *
 * Every number here was chosen against the *text* it has to carry, not by
 * eye. OKLCH's L is perceptual lightness, so contrast can be reasoned about
 * directly: light-mode text at L 0.36 over a page at L~0.95 washed with 20%
 * of an L 0.72 colour lands near 6:1, and dark-mode text at L 0.88 over an
 * L~0.16 ground washed with 22% of an L 0.62 colour lands near 5.8:1. Both
 * clear WCAG AA at any hue, because L carries the contrast and the hue only
 * rides along — which is the whole reason the user is allowed to pick a hue
 * and nothing else.
 */
const LIGHT: Record<Role, Recipe> = {
  bg: { l: 0.72, c: 0.12, a: 0.2, lift: true },
  border: { l: 0.62, c: 0.13, lift: true },
  text: { l: 0.36, c: 0.09 },
  glow: { l: 0.7, c: 0.14, a: 0.18, lift: true },
  fill: { l: 0.8, c: 0.12, a: 0.8, lift: true },
  soft: { l: 0.8, c: 0.12, a: 0.4, lift: true },
}

const DARK: Record<Role, Recipe> = {
  bg: { l: 0.62, c: 0.13, a: 0.22, lift: true },
  border: { l: 0.66, c: 0.13, lift: true },
  text: { l: 0.88, c: 0.06 },
  glow: { l: 0.7, c: 0.14, a: 0.22, lift: true },
  fill: { l: 0.7, c: 0.13, a: 0.5, lift: true },
  soft: { l: 0.62, c: 0.13, a: 0.25, lift: true },
}

/**
 * The hues already in the app, so nothing moves until someone chooses.
 *
 * These are the hues the hand-written rules in calendar.css and the graph's
 * Tailwind classes were already using; a couple are rounded by two or three
 * degrees where the two views disagreed, which is below the threshold anyone
 * can see.
 */
export const DEFAULT_TYPE_HUES: Readonly<TypeColors> = {
  task: 235,
  habit: 160,
  event: 78,
  contentpiece: 8,
  goal: 295,
  course: 266,
  assignment: 342,
  exam: 14,
  project: 183,
  note: 225,
  journalentry: 225,
  concept: 250,
}

/**
 * Types that are grey until someone says otherwise.
 *
 * A note or a concept is scaffolding, and painting every one of them a
 * saturated colour turns the graph into confetti. Choosing a hue for one is
 * an explicit "I want to see these", so the moment `typeColors` mentions the
 * type it gets full chroma like everything else.
 */
const MUTED_BY_DEFAULT = new Set(['note', 'journalentry', 'concept'])

/** How much of the chroma a muted type keeps. */
const MUTED_CHROMA = 0.28

/**
 * Names the same colour answers to.
 *
 * The calendar labels a published ContentPiece `content` (that is the word
 * its API uses), while the graph and the node-type list call the type
 * `ContentPiece`. One entry in settings has to drive both.
 */
const TYPE_ALIASES: Record<string, string> = {
  content: 'contentpiece',
}

/** The key everything is stored and looked up under. */
export function normalizeType(type: string): string {
  return type.trim().toLowerCase()
}

/** A CSS-identifier-safe form of a type name, for custom types like "Deep Work". */
export function typeSlug(type: string): string {
  return normalizeType(type).replace(/[^a-z0-9]+/g, '-')
}

/** Every name that should resolve to the same colour, canonical form first. */
function aliasesOf(type: string): string[] {
  const key = normalizeType(type)
  const canonical = TYPE_ALIASES[key] ?? key
  const names = [canonical, ...Object.keys(TYPE_ALIASES).filter((a) => TYPE_ALIASES[a] === canonical)]
  return names.includes(key) ? names : [key, ...names]
}

/** The hue for a type, or null when nobody — user or default — has one. */
export function resolveHue(typeColors: TypeColors, type: string): number | null {
  for (const name of aliasesOf(type)) {
    const chosen = typeColors[name]
    if (typeof chosen === 'number' && Number.isFinite(chosen)) return wrapHue(chosen)
  }
  for (const name of aliasesOf(type)) {
    const fallback = DEFAULT_TYPE_HUES[name]
    if (typeof fallback === 'number') return fallback
  }
  return null
}

/** Whether a type still has its quiet default rather than a chosen colour. */
export function isMuted(typeColors: TypeColors, type: string): boolean {
  return aliasesOf(type).every((name) => MUTED_BY_DEFAULT.has(name) && typeof typeColors[name] !== 'number')
}

export function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

const round = (n: number, places: number) => Number(n.toFixed(places))

/**
 * Yellow's correction.
 *
 * At a fixed lightness, hues around 95° (yellow) read as dark olive while
 * blues at the same L read as the colour they are — the one place where
 * OKLCH's uniformity is not enough on its own. Fills and edges get a small
 * lift there; text does not, because lifting text is exactly how contrast
 * gets lost.
 */
function yellowLift(hue: number): number {
  const d = hueDistance(hue, 95)
  return d >= 60 ? 0 : 0.045 * Math.cos((d / 60) * (Math.PI / 2))
}

/** One role's colour, as the OKLCH string the CSS already speaks. */
export function roleColor(hue: number, role: Role, dark: boolean, muted = false): string {
  const recipe = (dark ? DARK : LIGHT)[role]
  const h = wrapHue(hue)
  const l = round(recipe.l + (recipe.lift ? yellowLift(h) : 0), 3)
  const c = round(recipe.c * (muted ? MUTED_CHROMA : 1), 3)
  const base = `${l} ${c} ${round(h, 1)}`
  return recipe.a === undefined ? `oklch(${base})` : `oklch(${base} / ${recipe.a})`
}

/** Every role at once — what a preview or a swatch needs. */
export function typeStyleFor(hue: number, dark: boolean, muted = false): Record<Role, string> {
  return Object.fromEntries(ROLES.map((role) => [role, roleColor(hue, role, dark, muted)])) as Record<Role, string>
}

/** The custom property a type's colour is published under. */
export function typeVar(type: string, role: Role): string {
  return `--acture-c-${typeSlug(type)}-${role}`
}

/** That property, ready to use, with something neutral to fall back on. */
export function typeVarRef(type: string, role: Role, fallback?: string): string {
  return fallback ? `var(${typeVar(type, role)}, ${fallback})` : `var(${typeVar(type, role)})`
}

/** Every type that has a colour: the built-ins, plus whatever the user added. */
export function colouredTypes(typeColors: TypeColors): string[] {
  const names = new Set<string>(Object.keys(DEFAULT_TYPE_HUES))
  for (const name of Object.keys(typeColors)) {
    names.add(normalizeType(name))
    // So `.acture-content` follows a choice made on `ContentPiece`.
    for (const [alias, canonical] of Object.entries(TYPE_ALIASES)) {
      if (canonical === normalizeType(name)) names.add(alias)
    }
  }
  for (const alias of Object.keys(TYPE_ALIASES)) names.add(alias)
  return [...names].sort()
}

/**
 * The colours as a stylesheet, scoped to one container.
 *
 * Both modes are written out rather than picked in JavaScript, so toggling
 * light/dark repaints through the cascade like everything else instead of
 * waiting for a re-render — and so a type the user has never touched simply
 * has no property here and falls through to the fallback in calendar.css.
 */
export function typeColorCss(scope: string, typeColors: TypeColors): string {
  const block = (dark: boolean) =>
    colouredTypes(typeColors)
      .map((type) => {
        const hue = resolveHue(typeColors, type)
        if (hue === null) return ''
        const muted = isMuted(typeColors, type)
        return ROLES.map((role) => `${typeVar(type, role)}:${roleColor(hue, role, dark, muted)}`).join(';')
      })
      .filter(Boolean)
      .join(';')

  return `${scope}{${block(false)}}\n.dark ${scope}{${block(true)}}`
}

/* ─── Palette generation ──────────────────────────────── */

/**
 * The closest two hues may be and still be told apart.
 *
 * Side by side at the same lightness and chroma, a gap under roughly this
 * wide reads as "the same colour, maybe" — which is worse than no colour at
 * all, because the whole point is telling a task from a habit at a glance.
 */
export const MIN_HUE_SEPARATION = 24

/** The shorter way round the wheel between two hues, in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrapHue(a) - wrapHue(b)) % 360
  return d > 180 ? 360 - d : d
}

/** The closest pair in a set — the number that decides whether it works. */
export function minSeparation(hues: number[]): number {
  let min = 360
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) min = Math.min(min, hueDistance(hues[i], hues[j]))
  }
  return hues.length < 2 ? 360 : min
}

/** Whether every pair in a set is far enough apart to be distinguishable. */
export function isDistinguishable(hues: number[]): boolean {
  return minSeparation(hues) >= MIN_HUE_SEPARATION
}

/** Small, fast, and the same sequence for the same seed. */
function rng(seed: number) {
  let s = (Math.floor(seed) || 1) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * `count` hues spread as far apart as `count` hues can be.
 *
 * Even spacing rather than the golden angle: the golden angle only
 * approaches an even spread, and for the handful of types anyone actually
 * has it leaves visibly unequal gaps — one pair noticeably closer than the
 * rest, which is the single thing a palette must not do.
 */
export function evenHues(count: number, offset = 0): number[] {
  if (count <= 0) return []
  const step = 360 / count
  return Array.from({ length: count }, (_, i) => wrapHue(offset + i * step))
}

export interface PaletteOptions {
  /**
   * Same seed, same palette. "Generate" is a button people press twice, so
   * the randomness has to be the caller's to hold, not this function's.
   */
  seed?: number
  /**
   * Whether to reassign the hues among the types. It cannot reduce the
   * separation — the set of hues is unchanged, only which type gets which —
   * so shuffling is always safe.
   */
  shuffle?: boolean
}

/**
 * A hue for each type, evenly spread and rotated by the seed.
 *
 * Above 15 types the wheel cannot give everyone MIN_HUE_SEPARATION and even
 * spacing is simply the best available answer; `isDistinguishable` will say
 * so, and the caller can warn rather than this silently pretending.
 */
export function generatePalette(types: string[], options: PaletteOptions = {}): TypeColors {
  const names = [...new Set(types.map(normalizeType))].filter(Boolean)
  if (names.length === 0) return {}

  const random = rng(options.seed ?? 1)
  const hues = evenHues(names.length, random() * 360)

  if (options.shuffle !== false) {
    for (let i = hues.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[hues[i], hues[j]] = [hues[j], hues[i]]
    }
  }

  return Object.fromEntries(names.map((name, i) => [name, round(hues[i], 1)]))
}
