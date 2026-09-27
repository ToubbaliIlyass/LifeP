import { CONTENT_PROMPT } from '@/lib/content'

/**
 * What the app is made of, and what each part owns.
 *
 * A life planner is not one app. A student needs courses and exams; someone
 * who does not study needs never to see the word "assignment". The content
 * hub was the first thing to admit this, and it did so by hand: three
 * `settings.modules.content` checks scattered across a page, a chat route and
 * a calendar route — while the assistant, the linker, quick add, resurfacing,
 * the graph and MCP all went on knowing about content the user had switched
 * off. "Off" meant "hidden in three places", which is not off.
 *
 * So a module declares everything it owns, once, here. Every consumer asks
 * this file instead of naming a module itself, which is what makes a module
 * both fully integrated when it is on and completely absent when it is not:
 *
 *   off  ->  no tab, no quick-add entry, no graph filter, nothing on the
 *            calendar, no mention in the assistant's prompt or tools, not
 *            creatable over MCP, never linked, never resurfaced. The types
 *            simply do not exist as far as the app is concerned.
 *
 * Nothing is ever deleted by switching a module off. The nodes stay in the
 * database and reappear untouched when it comes back on — a switch is not a
 * delete, and a user trying the app without the content hub should not lose
 * a year of videos for it.
 */
export interface ModuleDef {
  id: string
  /** Shown in Settings and in onboarding. */
  label: string
  /** One line, for someone deciding whether this is for them. */
  blurb: string
  /**
   * The node types this module owns. When it is off these are invisible
   * everywhere: hidden from the assistant, the graph, search and the linker.
   */
  nodeTypes: string[]
  /** The tab it adds, when it has one. Hidden with the module. */
  tab?: string
  /** Appended to the assistant's system prompt while the module is on. */
  prompt?: string
  /** Of its types, those that must go through batchPropose rather than createNode. */
  proposeTypes?: string[]
  /**
   * Of its types, the ones that are *work with a date* — something owed, to
   * be done by a day, worth giving an hour to. These are what Today lists,
   * what the rail offers for dragging onto the calendar, and what the planner
   * lays into the day.
   *
   * Not every dated node is work, and conflating the two is nonsense in both
   * directions: a HealthMetric and a JournalEntry both carry a `date`, but
   * they are records of something that already happened. Treating them as
   * work put "weighed myself, 78kg" in the Now queue as a thing still to do,
   * offered last Tuesday's diary entry for scheduling, and had the planner
   * reserve half an hour to write a journal entry that was already written.
   */
  work?: string[]
}

/*
 * A module's own slice of the assistant's prompt.
 *
 * These used to live in the one big SYSTEM_PROMPT, which is why a user with
 * no school still had Courses, Assignments and Exams described to the model
 * in every single request — and got them created. A section is only ever sent
 * while its module is on, so the types it names cannot be invented.
 */
const SCHOOL_PROMPT = `

## School (enabled for this user)
**Course** -- { name, code, semester, credits }
**Assignment** -- { name, courseNodeId, dueDate (YYYY-MM-DD), status (todo/submitted/graded), grade }
**Exam** -- { name, courseNodeId, date (YYYY-MM-DD), time (HH:MM), location, status (upcoming/taken/graded), grade }
All three are structural: create with batchPropose, never createNode.
- Link Assignments and Exams to their Course via the courseNodeId property AND a "part-of" edge. A new Assignment or Exam ALWAYS gets that edge.
- When the user mentions submitting: update Assignment status to "submitted" (auto). A grade: update the grade property (auto). Sitting an exam: update Exam status to "taken" (auto).
- A syllabus or timetable in an attachment becomes Courses, Assignments and Exams here.`

const HEALTH_PROMPT = `

## Health (enabled for this user)
**HealthMetric** -- { label (e.g. "run", "weight", "sleep"), value (number), unit (e.g. "min", "kg", "hrs"), date (YYYY-MM-DD) } -- a logged data point.
When the user mentions one ("ran 5k", "weighed myself"), log it directly with createNode -- no proposal needed, same tier as Notes.`

const JOURNAL_PROMPT = `

## Journal (enabled for this user)
**JournalEntry** -- { date (YYYY-MM-DD), content, mood (great/good/okay/bad/awful) }.
Write one with the **writeJournal** tool, never createNode: a journal is one page per date, and writeJournal joins what they say to that day's entry instead of starting a second one.
- Reflection belongs here ("today was hard", "felt good after the gym", "worried about Thursday"); what they *did* belongs in logActivity. Something that is both gets both.
- Write it in their voice, close to their own words -- not a report about them.
- Set mood only when they make it plain. Do not interrogate them for one.`

export const MODULES: ModuleDef[] = [
  {
    id: 'content',
    label: 'Content hub',
    blurb: 'Track videos, posts and episodes from idea to published.',
    nodeTypes: ['ContentSeries', 'ContentPiece'],
    // A series is a container; the piece is the thing with a date on it.
    work: ['ContentPiece'],
    tab: 'content',
    prompt: CONTENT_PROMPT,
    proposeTypes: ['ContentSeries'],
  },
  {
    id: 'school',
    label: 'School',
    blurb: 'Courses, assignments and exams, with due dates and grades.',
    nodeTypes: ['Course', 'Assignment', 'Exam'],
    // A course is a container. An exam is work even though it is sat rather
    // than done: it has a date, it needs preparing for, and it must not be
    // planned over.
    work: ['Assignment', 'Exam'],
    tab: 'school',
    prompt: SCHOOL_PROMPT,
    proposeTypes: ['Course', 'Assignment', 'Exam'],
  },
  {
    id: 'health',
    label: 'Health',
    blurb: 'Log weight, runs, sleep and anything else you measure.',
    nodeTypes: ['HealthMetric'],
    tab: 'health',
    prompt: HEALTH_PROMPT,
  },
  {
    id: 'journal',
    label: 'Journal',
    blurb: 'Dated entries with a mood, kept alongside everything else.',
    nodeTypes: ['JournalEntry'],
    tab: 'journal',
    prompt: JOURNAL_PROMPT,
  },
]

export type ModuleSettings = Record<string, boolean>

/**
 * Anything carrying the module switches. Deliberately looser than `Settings`:
 * callers hold everything from a freshly read settings node to a half-built
 * draft in onboarding, and all any of this needs is the one field.
 */
export type ModuleAware = { modules?: ModuleSettings } | null | undefined

/**
 * Whether a module is on.
 *
 * Absent means off for everything except the ones that predate modules being
 * a choice — School, Health and Journal were always there, so a user who has
 * never seen the module screen keeps them rather than silently losing their
 * courses on the next deploy. Onboarding writes an explicit answer for each,
 * after which this default never applies again.
 */
const ON_UNLESS_SAID_OTHERWISE = new Set(['school', 'health', 'journal'])

export function moduleEnabled(settings: ModuleAware, id: string): boolean {
  const modules = (settings?.modules ?? {}) as ModuleSettings
  if (typeof modules[id] === 'boolean') return modules[id]
  return ON_UNLESS_SAID_OTHERWISE.has(id)
}

export function enabledModules(settings: ModuleAware): ModuleDef[] {
  return MODULES.filter((m) => moduleEnabled(settings, m.id))
}

/**
 * Node types belonging to modules that are switched off.
 *
 * The single answer to "should this be visible?", asked by the assistant's
 * tools, the linker, the graph, quick add, resurfacing and MCP alike.
 */
export function hiddenTypes(settings: ModuleAware): Set<string> {
  const hidden = new Set<string>()
  for (const m of MODULES) {
    if (!moduleEnabled(settings, m.id)) for (const t of m.nodeTypes) hidden.add(t)
  }
  return hidden
}

/** Tabs belonging to switched-off modules, hidden from the sidebar. */
export function hiddenTabs(settings: ModuleAware): Set<string> {
  const hidden = new Set<string>()
  for (const m of MODULES) {
    if (m.tab && !moduleEnabled(settings, m.id)) hidden.add(m.tab)
  }
  return hidden
}

/** The prompt sections of every enabled module, in registry order. */
export function modulePrompts(settings: ModuleAware): string {
  return enabledModules(settings).map((m) => m.prompt ?? '').join('')
}

/**
 * Dated work owned by the enabled modules.
 *
 * Asked by Today, the unscheduled rail and the planner. Modules whose types
 * are all records — Health, Journal — contribute nothing here, which is the
 * point.
 */
export function workTypes(settings: ModuleAware): Set<string> {
  const off = hiddenTypes(settings)
  return new Set(
    enabledModules(settings).flatMap((m) => m.work ?? []).filter((t) => !off.has(t)),
  )
}

/** Types that must be proposed rather than created, from enabled modules only. */
export function moduleProposeTypes(settings: ModuleAware): string[] {
  return enabledModules(settings).flatMap((m) => m.proposeTypes ?? [])
}
