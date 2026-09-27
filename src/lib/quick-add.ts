import { todayStr } from '@/lib/date'
import { hiddenTypes, type ModuleAware } from '@/lib/modules'
import { CONTENT_PLATFORMS } from '@/lib/content'

/**
 * What quick capture can create, and what each type needs.
 *
 * Shared by the two ways in — the floating sheet on a phone, the inline bar
 * at the top of Today on a laptop — so adding a type or changing a field
 * happens once rather than in two places that slowly stop agreeing.
 */

export type QuickType =
  | 'Task' | 'Note' | 'Event' | 'HealthMetric' | 'Goal'
  | 'Habit' | 'Project' | 'Course' | 'Exam' | 'Assignment' | 'ContentPiece'

export const QUICK_TYPES: { id: QuickType; label: string }[] = [
  { id: 'Task', label: 'Task' },
  { id: 'Note', label: 'Note' },
  { id: 'Event', label: 'Event' },
  { id: 'HealthMetric', label: 'Health' },
  { id: 'Goal', label: 'Goal' },
  { id: 'Habit', label: 'Habit' },
  { id: 'Project', label: 'Project' },
  { id: 'Course', label: 'Course' },
  { id: 'Exam', label: 'Exam' },
  { id: 'Assignment', label: 'Assignment' },
  { id: 'ContentPiece', label: 'Content idea' },
]

/** The capture types this user actually has, given the modules they use. */
export function quickTypesFor(settings: ModuleAware): { id: QuickType; label: string }[] {
  const off = hiddenTypes(settings)
  return QUICK_TYPES.filter((t) => !off.has(t.id))
}

/** Types that can sensibly belong to a Goal, Project or Course. */
export const LINKABLE_TYPES: QuickType[] = ['Task', 'Habit', 'Assignment', 'Exam', 'Event']

export interface SecondaryField {
  label: string
  type: 'date' | 'number' | 'text' | 'select'
  placeholder?: string
  options?: string[]
}

/** The one extra field worth asking for at capture time, if any. */
export function secondaryFieldFor(type: QuickType): SecondaryField | null {
  switch (type) {
    case 'Task': return { label: 'Due date', type: 'date' }
    case 'Event': return { label: 'Date', type: 'date' }
    case 'HealthMetric': return { label: 'Value', type: 'number', placeholder: '0' }
    case 'Goal': return { label: 'Target date', type: 'date' }
    case 'Habit': return { label: 'Frequency', type: 'select', options: ['daily', 'weekly', 'weekdays'] }
    case 'Project': return { label: 'Due date', type: 'date' }
    case 'Course': return { label: 'Code', type: 'text', placeholder: 'CS 101' }
    case 'Exam': return { label: 'Date', type: 'date' }
    case 'Assignment': return { label: 'Due date', type: 'date' }
    case 'Note': return null
    // An idea arrives as a title and nothing else; the stage is where it
    // starts, and the platform is the one thing worth asking at capture.
    case 'ContentPiece': return { label: 'Platform', type: 'select', options: [...CONTENT_PLATFORMS] }
  }
}

/** What to send as the new node's properties. */
export function propertiesFor(type: QuickType, name: string, secondary: string): Record<string, unknown> {
  // todayStr, not toISOString: the latter is UTC and hands back the wrong
  // day either side of midnight depending on the offset.
  const today = todayStr()
  switch (type) {
    case 'Task': return { name, status: 'todo', dueDate: secondary || null }
    case 'Note': return { title: name, content: '' }
    case 'Event': return { name, date: secondary || null }
    case 'HealthMetric': return { label: name, value: secondary ? Number(secondary) : null, date: today }
    case 'Goal': return { name, status: 'active', targetDate: secondary || null }
    case 'Habit': return { name, frequency: secondary || 'daily' }
    case 'Project': return { name, status: 'active', dueDate: secondary || null }
    case 'Course': return { name, code: secondary || null }
    case 'Exam': return { name, status: 'upcoming', date: secondary || null }
    case 'Assignment': return { name, status: 'todo', dueDate: secondary || null }
    case 'ContentPiece': return { title: name, stage: 'idea', platform: secondary || null }
  }
}

/** The placeholder for the name field, which is the only required one. */
export function namePlaceholderFor(type: QuickType): string {
  switch (type) {
    case 'Note': return 'Write it down…'
    case 'HealthMetric': return 'e.g. Run, Weight…'
    case 'Task': return 'What needs doing?'
    case 'ContentPiece': return 'What could you make?'
    default: return `New ${type.toLowerCase()}…`
  }
}
