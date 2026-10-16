import { getNodes, createNode, updateNode } from '@/lib/graph/queries'
import type { Madhab } from '@/lib/prayer-times'

/**
 * User settings, stored as a single Settings node rather than a new table.
 *
 * Same approach as SavedView: it is per-user state with a shape that will
 * keep changing, and the node's properties are already free-form JSON. That
 * means adding a setting later needs no migration — which matters, because
 * this is going to grow. Settings nodes are hidden from the graph view, like
 * TimeBlock and SavedView.
 */
/** What the last graph sweep did. Written by src/lib/ai/graph-sweep.ts. */
export interface SweepSummary {
  ranAt: string
  scanned: number
  linked: number
  proposed: number
  tidied: number
  remaining: number
}

export interface Settings {
  /** Sidebar tabs the user has chosen to hide. */
  hiddenTabs: string[]
  /** Which tab the app opens on. */
  defaultTab: string
  /** Day or week when the Calendar opens. */
  defaultCalendarView: 'day' | 'week'
  /** Colour palette, layered on top of light/dark mode. See src/lib/themes.ts. */
  theme: string
  /**
   * Light/dark mode. Stored here as well as in localStorage for the same
   * reason as the palette: localStorage is the copy that can be read before
   * first paint, this is the copy a second device starts from. `system`
   * means "no choice made" and follows the OS.
   */
  mode: 'light' | 'dark' | 'system'
  /** Weather on the dashboard. Stored so the location is asked for once, not every visit. */
  weather: { enabled: boolean; lat: number | null; lon: number | null; place: string | null }
  /**
   * How the app handles tasks that are due but have no time.
   * - off:     nothing happens
   * - suggest: it proposes times each morning for the user to approve
   * - auto:    it places them directly, no approval
   */
  scheduleMode: 'off' | 'suggest' | 'auto'
  /**
   * Whether the setup interview has been done.
   *
   * The app used to open on an empty graph with a scheduler that had never
   * seen this person: no goals, no fixed commitments, no idea when they are
   * busy, and nothing to learn from until weeks of clicks accumulated. The
   * interview fills that in once, so the first plan is already roughly right.
   */
  onboarding: { completed: boolean; completedAt: string | null }
  /**
   * Colours, per node type, as an OKLCH hue in degrees (0-360).
   *
   * A hue rather than a colour: the app has a light and a dark mode and a
   * palette of its own, and a stored hex would be wrong in one of them and
   * clash with the theme in both. Lightness and chroma come from the theme,
   * the hue comes from here, so a user's choice survives a theme change and
   * stays legible either side of midnight.
   */
  typeColors: Record<string, number>
  /**
   * Canvas (the LMS) — the school module's optional source of truth.
   *
   * The token is NOT here: it lives in its own node so that exporting the
   * graph, or letting the assistant read settings, cannot hand it out.
   */
  canvas: { enabled: boolean; baseUrl: string | null; lastSync: string | null; lastError: string | null }
  /**
   * Optional sections that are not for everyone. Off means gone: no tab, not
   * described to the assistant, nothing on the calendar. Data is kept, so
   * switching back on restores everything.
   */
  modules: Record<string, boolean>
  /**
   * What the assistant does when the user creates something by hand — an
   * event on the calendar, a note, a task from quick add.
   * - off:     nothing
   * - suggest: it queues a proposal for the user to approve
   * - auto:    it writes the edges straight into the graph
   * Edges are additive and removable in a click, which is why `auto` is a
   * reasonable default here where it would not be for creating nodes.
   */
  autoLink: 'off' | 'suggest' | 'auto'
  /**
   * The recurring tidy-up: every `intervalDays`, everything that has drifted
   * into the graph unconnected gets another look. `lastRun` is written by the
   * sweep itself, not by the settings screen.
   */
  graphSweep: { enabled: boolean; intervalDays: number; lastRun: SweepSummary | null }
  /** How long something can go untouched before it is offered back for review. */
  resurfaceDays: number
  /**
   * Prayer times on the Now timeline, computed from the same location the
   * weather uses. Off by default: this is a personal practice, not a feature
   * every account should wake up to.
   */
  prayer: {
    enabled: boolean
    /** See METHODS in src/lib/prayer-times.ts — decides the twilight angles. */
    method: string
    /** Which shadow length defines Asr. An hour's difference. */
    madhab: Madhab
    /**
     * The Habit the five tick off, so a streak and its goal link keep
     * working. Resolved once by name and remembered.
     */
    habitNodeId: number | null
  }
  /**
   * IANA zone, captured with the location. Prayer times are local solar
   * times, and once deployed the server is in UTC with no idea where the
   * reader is.
   */
  timeZone: string | null
  /**
   * A zone the user pinned by hand, overriding the browser's. Browsers ship
   * their own zone data and it can lag reality — Morocco going back to UTC+0
   * left the browser an hour ahead of the wall — so this wins everywhere:
   * on screen (src/lib/wallclock.ts) and on the server (zoneFor).
   */
  timeZoneOverride: string | null
  /**
   * Simple mode: Today, Calendar and Goals in the sidebar, the rest behind
   * "More"; Today down to capture and the day itself; the specialist
   * settings folded away. On by default — the full app had grown past what
   * one person could use day to day. Off shows everything, as before.
   */
  simple: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  hiddenTabs: [],
  defaultTab: 'today',
  defaultCalendarView: 'day',
  theme: 'default',
  mode: 'system',
  weather: { enabled: false, lat: null, lon: null, place: null },
  scheduleMode: 'suggest',
  onboarding: { completed: false, completedAt: null },
  typeColors: {},
  canvas: { enabled: false, baseUrl: null, lastSync: null, lastError: null },
  modules: {},
  autoLink: 'auto',
  graphSweep: { enabled: true, intervalDays: 7, lastRun: null },
  resurfaceDays: 21,
  prayer: { enabled: false, method: 'morocco', madhab: 'standard', habitNodeId: null },
  timeZone: null,
  timeZoneOverride: null,
  simple: true,
}

async function settingsNode(userId: number) {
  const existing = await getNodes(userId, { type: 'Settings' })
  return existing[0] ?? null
}

/**
 * Settings as the server sees them, merged over the defaults so a setting
 * added after this user's node was written still comes back with a sane
 * value instead of undefined.
 */
export async function readSettings(userId: number): Promise<Settings> {
  const node = await settingsNode(userId)
  return { ...DEFAULT_SETTINGS, ...((node?.properties ?? {}) as Partial<Settings>) }
}

/** Merges a patch into the stored settings and returns the result. */
export async function writeSettings(userId: number, patch: Partial<Settings>): Promise<Settings> {
  const node = await settingsNode(userId)
  const next: Settings = {
    ...DEFAULT_SETTINGS,
    ...((node?.properties ?? {}) as Partial<Settings>),
    ...patch,
  }
  if (node) await updateNode(userId, node.id, next as unknown as Record<string, unknown>)
  else await createNode(userId, 'Settings', next as unknown as Record<string, unknown>)
  return next
}
