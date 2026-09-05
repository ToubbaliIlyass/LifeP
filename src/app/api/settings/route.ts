import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes, createNode, updateNode } from '@/lib/graph/queries'

/**
 * User settings, stored as a single Settings node rather than a new table.
 *
 * Same approach as SavedView: it is per-user state with a shape that will
 * keep changing, and the node's properties are already free-form JSON. That
 * means adding a setting later needs no migration — which matters, because
 * this is going to grow. Settings nodes are hidden from the graph view, like
 * TimeBlock and SavedView.
 */
export interface Settings {
  /** Sidebar tabs the user has chosen to hide. */
  hiddenTabs: string[]
  /** Which tab the app opens on. */
  defaultTab: string
  /** Day or week when the Calendar opens. */
  defaultCalendarView: 'day' | 'week'
  /** Colour palette, layered on top of light/dark mode. See src/lib/themes.ts. */
  theme: string
  /** Weather on the dashboard. Stored so the location is asked for once, not every visit. */
  weather: { enabled: boolean; lat: number | null; lon: number | null; place: string | null }
  /**
   * Place due and overdue tasks into free calendar slots automatically, so
   * "when do I do this" stops being a question the user has to answer.
   */
  autoScheduleTasks: boolean
  /** The window auto-scheduling is allowed to place things in, 24h HH:MM. */
  workingHours: { start: string; end: string }
}

export const DEFAULT_SETTINGS: Settings = {
  hiddenTabs: [],
  defaultTab: 'today',
  defaultCalendarView: 'day',
  theme: 'default',
  weather: { enabled: false, lat: null, lon: null, place: null },
  autoScheduleTasks: false,
  workingHours: { start: '09:00', end: '18:00' },
}

async function settingsNode(userId: number) {
  const existing = await getNodes(userId, { type: 'Settings' })
  return existing[0] ?? null
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const node = await settingsNode(user.id)
  const stored = (node?.properties ?? {}) as Partial<Settings>

  // Merged over the defaults so a setting added after this node was written
  // still comes back with a sane value instead of undefined.
  return Response.json({ settings: { ...DEFAULT_SETTINGS, ...stored } })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as Partial<Settings>
  const node = await settingsNode(user.id)

  const next: Settings = {
    ...DEFAULT_SETTINGS,
    ...((node?.properties ?? {}) as Partial<Settings>),
    ...body,
  }

  if (node) {
    await updateNode(user.id, node.id, next as unknown as Record<string, unknown>)
  } else {
    await createNode(user.id, 'Settings', next as unknown as Record<string, unknown>)
  }

  return Response.json({ ok: true, settings: next })
}
