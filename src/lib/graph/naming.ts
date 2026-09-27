/**
 * What a node is called, and which nodes must be called something.
 *
 * Properties are free-form JSON and the identity field differs by type — a
 * Note uses `title`, a HealthMetric uses `label`, everything else uses
 * `name`. Three places had their own copy of that rule and a fourth had none,
 * which is how a Project got created carrying nothing but
 * `{"status":"in-progress"}` and then showed up on the dashboard as
 * "Project #407".
 */

/**
 * Types the user never refers to by name, so they need none.
 *
 * Mostly bookkeeping — but a JournalEntry belongs here too: it is a date and
 * some prose, and demanding a title for it meant the assistant could not
 * write one at all. Every attempt came back "a JournalEntry needs a name".
 */
const NAMELESS_TYPES = new Set([
  'HabitLog', 'TimeBlock', 'SavedView', 'Settings',
  'Memory', 'AvailabilityRule', 'ActivitySignal', 'ApiToken',
  'JournalEntry',
])

/** The identity a node carries, whichever field it keeps it in. */
export function identityOf(properties: Record<string, unknown>): string | null {
  for (const key of ['name', 'title', 'label'] as const) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Whether a node of this type is unusable without something to call it. */
export function needsIdentity(type: string): boolean {
  return !NAMELESS_TYPES.has(type)
}

/**
 * What to show for a node. Falls back to "Untitled project" rather than
 * "Project #407": an id is not a name, and the point of showing the thing at
 * all is so it can be recognised, renamed or deleted.
 */
export function displayName(type: string, properties: Record<string, unknown>): string {
  return identityOf(properties) ?? `Untitled ${type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`
}
