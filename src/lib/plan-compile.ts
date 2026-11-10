import { z } from 'zod'
import { addDays } from '@/lib/date'
import type { BatchOperation } from '@/lib/ai/tools'

/**
 * A plan, said by the model as a small structured thing and turned into graph
 * operations HERE, in plain code, so nothing the model writes reaches the
 * graph as it wrote it: a name is trimmed, a length clamped, a repeat made
 * valid, a count capped. The model never emits raw operations for a plan.
 *
 * Days are offsets from "today", and are resolved again when the plan is
 * approved (resolvePlanDates), so a plan approved two days after it was
 * suggested starts when the user approves it, not in the past.
 */

export const MAX_PLAN_ITEMS = 25
const MAX_HEADINGS = 8
const MAX_ONE_OFFS_PER_DAY = 3
const MAX_START_OFFSET = 120

export const PlanInputSchema = z.object({
  intent: z.string().describe('What the user wants, in their words'),
  area: z.object({
    existingId: z.number().optional().describe('The id of one of their existing areas, if one fits'),
    name: z.string().optional().describe('A new area to put it under, only if none of theirs fits'),
  }).optional(),
  project: z.object({
    name: z.string().describe('Short, as it would be written on a list: "Run a marathon"'),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, only if they named one'),
  }),
  headings: z.array(z.object({
    key: z.string().describe('A short id you choose, e.g. "prep"; steps point at it with headingKey'),
    title: z.string().describe('A phase of the plan: "Get ready", "Build the base", "Race week"'),
  })).max(MAX_HEADINGS).optional().describe('Phases, when the plan has more than about 8 steps or a clear sequence. Shown as sections inside the project.'),
  items: z.array(z.object({
    headingKey: z.string().optional().describe('Which phase this step belongs to'),
    priority: z.enum(['high', 'medium', 'low']).optional().describe('high only for what the rest depends on or has a hard date'),
    checklist: z.array(z.string()).max(8).optional().describe('The small parts inside this step, when it has a few'),
    title: z.string().describe('One concrete step or routine, starting with a verb'),
    minutes: z.number().optional().describe('How long it takes'),
    notes: z.string().optional(),
    startOffsetDays: z.number().int().min(0).max(MAX_START_OFFSET).describe('Days from today to the first one: 0 is today'),
    repeats: z.object({
      frequency: z.enum(['daily', 'weekdays', 'weekly']),
      days: z.array(z.number().int().min(0).max(6)).optional().describe('Weekly only: 0=Sunday … 6=Saturday'),
      untilOffsetDays: z.number().int().min(0).max(366).optional().describe('Days from today after which it stops, if it does'),
    }).optional(),
  })).min(1),
  assumptions: z.array(z.string()).describe('What you assumed, in plain words, because they did not say'),
})
export type PlanInput = z.infer<typeof PlanInputSchema>

/** Kept on each planned task's operation so its dates can be worked out again at approval. */
export interface PlanTag { start: number; frequency?: 'daily' | 'weekdays' | 'weekly'; days?: number[]; until?: number }

const dow = (date: string) => new Date(date + 'T00:00:00').getDay()

/** The first day on or after `from` that the repeat falls on; `from` itself when it does not repeat. */
function snapToRepeat(from: string, tag: PlanTag): string {
  if (!tag.frequency || tag.frequency === 'daily') return from
  const allowed = tag.frequency === 'weekdays' ? [1, 2, 3, 4, 5] : (tag.days ?? [])
  if (!allowed.length) return from
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    if (allowed.includes(dow(d))) return d
  }
  return from
}

/** The concrete dates for a planned task, from today. Pure. */
export function planDates(tag: PlanTag, today: string): { dueDate: string; deadline?: string } {
  const dueDate = snapToRepeat(addDays(today, tag.start), tag)
  if (tag.until === undefined) return { dueDate }
  const until = addDays(today, tag.until)
  // A repeat that would stop before it starts is just one that starts and stops: never earlier than its first day.
  return { dueDate, deadline: until < dueDate ? dueDate : until }
}

const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, n) : '')

export interface CompiledPlan {
  operations: BatchOperation[]
  summary: string
  /** Things dropped or repaired, said to the user so nothing is silent. */
  warnings: string[]
}

/**
 * Turns the model's plan into operations. Tasks only, one project, at most
 * MAX_PLAN_ITEMS items, optionally under one existing or one new area.
 */
export function compilePlan(input: PlanInput, ctx: { today: string; areaIds: Set<number> }): CompiledPlan {
  const warnings: string[] = []
  const projectName = clean(input.project.name, 80) || clean(input.intent, 80)
  if (!projectName) throw new Error('A plan needs a name.')

  const operations: BatchOperation[] = []
  // Where it lives: one of their own areas, or one new one, or nowhere.
  let areaRef: string | null = null
  const wanted = input.area?.existingId
  if (typeof wanted === 'number' && ctx.areaIds.has(wanted)) areaRef = String(wanted)
  else {
    const areaName = clean(input.area?.name, 60)
    if (typeof wanted === 'number' && !areaName) warnings.push('That area was not found, so it was left out.')
    if (areaName) {
      operations.push({ kind: 'createNode', type: 'Goal', properties: { name: areaName, status: 'active' } })
      areaRef = '$0'
    }
  }

  const projectIndex = operations.length
  const deadline = input.project.deadline && input.project.deadline >= ctx.today ? input.project.deadline : undefined
  if (input.project.deadline && !deadline) warnings.push('The deadline had already passed, so it was left out.')
  operations.push({ kind: 'createNode', type: 'Project', properties: { name: projectName, status: 'active', ...(deadline ? { dueDate: deadline } : {}) } })
  if (areaRef) operations.push({ kind: 'createEdge', sourceRef: `$${projectIndex}`, targetRef: areaRef, type: 'part-of' })

  // Phases: sections inside the project. A step names one by key; an unknown key just leaves it unsectioned.
  const headings = (input.headings ?? []).map((h, i) => ({ key: h.key, id: `h${i + 1}`, title: clean(h.title, 60) })).filter((h) => h.title).slice(0, MAX_HEADINGS)
  if (headings.length) {
    ;(operations[projectIndex] as { properties: Record<string, unknown> }).properties.headings = headings.map((h) => ({ id: h.id, title: h.title }))
  }
  const headingOf = new Map(headings.map((h) => [h.key, h.id]))
  /** One-off steps already placed on each day, so a day is never buried and the first days are not all the plan. */
  const oneOffsOn = new Map<string, number>()
  /** Minutes of work on each of the first fourteen days, to say so when it is too much. */
  const load = new Map<string, number>()

  let kept = 0
  for (const item of input.items) {
    const title = clean(item.title, 120)
    if (!title) continue
    if (kept >= MAX_PLAN_ITEMS) { warnings.push(`Only the first ${MAX_PLAN_ITEMS} steps were kept.`); break }

    let tag: PlanTag = { start: Math.max(0, Math.min(MAX_START_OFFSET, Math.round(item.startOffsetDays))) }
    if (item.repeats) {
      const days = [...new Set((item.repeats.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
      if (item.repeats.frequency === 'weekly' && days.length === 0) {
        warnings.push(`“${title}” repeats weekly but no day was given, so it was added as a single step.`)
      } else {
        tag = { ...tag, frequency: item.repeats.frequency, ...(item.repeats.frequency === 'weekly' ? { days } : {}), ...(item.repeats.untilOffsetDays !== undefined ? { until: item.repeats.untilOffsetDays } : {}) }
      }
    }
    let dates = planDates(tag, ctx.today)
    // A "repeat" that stops the day it starts is just one step, and is stored as one.
    if (tag.frequency && dates.deadline && dates.deadline === dates.dueDate) {
      tag = { start: tag.start }
      dates = planDates(tag, ctx.today)
    }
    // No more than a few one-off steps on one day: the rest move to the next day, and it is said.
    if (!tag.frequency) {
      let moved = 0
      while ((oneOffsOn.get(dates.dueDate) ?? 0) >= MAX_ONE_OFFS_PER_DAY && moved < 14) {
        tag = { ...tag, start: tag.start + 1 }
        dates = planDates(tag, ctx.today)
        moved++
      }
      if (moved) warnings.push(`“${title}” was moved ${moved} day${moved === 1 ? '' : 's'} later so a day is not overloaded.`)
      oneOffsOn.set(dates.dueDate, (oneOffsOn.get(dates.dueDate) ?? 0) + 1)
    }
    const minutes = typeof item.minutes === 'number' && item.minutes >= 5 ? Math.min(480, Math.round(item.minutes)) : 30
    const taskIndex = operations.filter((o) => o.kind === 'createNode').length
    const notes = clean(item.notes, 300)
    const headingId = item.headingKey ? headingOf.get(item.headingKey) : undefined
    const checklist = (item.checklist ?? []).map((t) => clean(t, 120)).filter(Boolean).slice(0, 8).map((text, i) => ({ id: `c${i + 1}`, text, done: false }))
    // The first fortnight's load, by day.
    for (let d = 0; d < 14; d++) {
      const day = addDays(ctx.today, d)
      const on = tag.frequency ? (tag.frequency === 'daily' || (tag.frequency === 'weekdays' && [1, 2, 3, 4, 5].includes(dow(day))) || (tag.frequency === 'weekly' && (tag.days ?? []).includes(dow(day)))) && day >= dates.dueDate && (!dates.deadline || day <= dates.deadline) : day === dates.dueDate
      if (on) load.set(day, (load.get(day) ?? 0) + minutes)
    }
    operations.push({
      kind: 'createNode',
      type: 'Task',
      properties: {
        name: title,
        status: 'todo',
        priority: item.priority ?? 'medium',
        estimatedMinutes: minutes,
        dueDate: dates.dueDate,
        ...(dates.deadline ? { deadline: dates.deadline } : {}),
        ...(tag.frequency ? { recurrence: { frequency: tag.frequency, ...(tag.frequency === 'weekdays' ? { daysOfWeek: [1, 2, 3, 4, 5] } : tag.frequency === 'weekly' ? { daysOfWeek: tag.days } : {}) } } : {}),
        ...(notes ? { notes } : {}),
        ...(headingId ? { headingId } : {}),
        ...(checklist.length ? { checklist } : {}),
      },
      plan: tag,
    } as BatchOperation)
    operations.push({ kind: 'createEdge', sourceRef: `$${taskIndex}`, targetRef: `$${projectIndex}`, type: 'part-of' })
    kept++
  }
  if (kept === 0) throw new Error('A plan needs at least one step.')

  // Things worth saying about the shape of it, never silently fixed.
  const earliest = Math.min(...input.items.map((i) => i.startOffsetDays))
  if (earliest > 2) warnings.push('Nothing starts in the first two days; a first small step soon makes it real.')
  const heavy = [...load.entries()].filter(([, m]) => m > 180).length
  if (heavy > 0) warnings.push(`${heavy} of the first 14 days have more than 3 hours of work in them.`)

  const repeating = input.items.filter((i) => i.repeats).length
  // Their assumptions, tidied: no "I assumed", no stray full stops, one line each.
  const assumed = input.assumptions.map((a) => clean(a, 160).replace(/^i\s+(?:have\s+)?assum(?:e|ed|ing)\s+(?:that\s+)?/i, '').replace(/[.;]+$/, '')).filter(Boolean)
  const summary = `Plan: ${projectName}\n\n${kept} step${kept === 1 ? '' : 's'}${repeating ? `, ${repeating} repeating` : ''}.${assumed.length ? ` Assumed: ${assumed.join('; ')}.` : ''}${warnings.length ? ` ${warnings.join(' ')}` : ''}`
  return { operations, summary, warnings }
}

/**
 * Works the dates out again for the day the plan is approved: every planned
 * task keeps its offsets, so approving later starts later. Operations without
 * a plan tag are left exactly as they are.
 */
export function resolvePlanDates(operations: BatchOperation[], today: string): BatchOperation[] {
  return operations.map((op) => {
    const tag = (op as { plan?: PlanTag }).plan
    if (op.kind !== 'createNode' || !tag) return op
    const dates = planDates(tag, today)
    const { deadline: _drop, ...rest } = op.properties as Record<string, unknown>
    void _drop
    return { ...op, properties: { ...rest, dueDate: dates.dueDate, ...(dates.deadline ? { deadline: dates.deadline } : {}) } } as BatchOperation
  })
}

/**
 * The plan without some of its tasks (the user unticked them), by position
 * among the batch's created nodes. The project and area cannot be removed;
 * a removed task takes its links with it and every remaining "$N" is renumbered.
 */
export function withoutNodes(operations: BatchOperation[], exclude: number[]): BatchOperation[] {
  const types: string[] = []
  for (const op of operations) if (op.kind === 'createNode') types.push(op.type)
  // Steps and whole areas can be left out; the project itself cannot, and an area takes what sits under it with it.
  const drop = new Set<number>(exclude.filter((i) => i >= 0 && i < types.length && (types[i] === 'Task' || types[i] === 'Goal')))
  if (drop.size === 0) return operations
  const links = operations.filter((o): o is Extract<BatchOperation, { kind: 'createEdge' }> => o.kind === 'createEdge')
  const idx = (r: string) => (/^\$(\d+)$/.test(r) ? Number(r.slice(1)) : null)
  for (let grew = true; grew;) {
    grew = false
    for (const e of links) {
      const from = idx(e.sourceRef)
      const to = idx(e.targetRef)
      if (from !== null && to !== null && drop.has(to) && !drop.has(from)) { drop.add(from); grew = true }
    }
  }
  const renumber = new Map<number, number>()
  let next = 0
  for (let i = 0; i < types.length; i++) if (!drop.has(i)) renumber.set(i, next++)
  const ref = (r: string): string | null => {
    const i = idx(r)
    if (i === null) return r
    const to = renumber.get(i)
    return to === undefined ? null : `$${to}`
  }
  const out: BatchOperation[] = []
  let seen = 0
  for (const op of operations) {
    if (op.kind === 'createNode') { if (!drop.has(seen)) out.push(op); seen++; continue }
    if (op.kind === 'createEdge') {
      const s = ref(op.sourceRef)
      const t = ref(op.targetRef)
      if (s !== null && t !== null) out.push({ ...op, sourceRef: s, targetRef: t })
      continue
    }
    out.push(op)
  }
  return out
}

/** Metadata a rearrangement puts on the two operations that make up one move, so the screen can show it and the user can leave it out. */
export interface MoveTag {
  id: number
  /** A to-do moving (the default), a list renamed, or a list merged into another. */
  kind?: 'move' | 'rename' | 'merge'
  /** The to-do, or for a rename or merge the list it is about. */
  todoId: number
  todo: string
  from: string | null
  to: string
  /** For a merge: how many things go across. */
  count?: number
}

/** The proposal without the moves the user unticked: both halves of a move go together. */
export function withoutMoves(operations: BatchOperation[], excludeIds: number[]): BatchOperation[] {
  if (excludeIds.length === 0) return operations
  const drop = new Set(excludeIds)
  return operations.filter((op) => {
    const move = (op as { move?: MoveTag }).move
    return !(move && drop.has(move.id))
  })
}


// ── Areas of life ───────────────────────────────────────────────────────

export const AreasInputSchema = z.object({
  areas: z.array(z.object({
    name: z.string().describe('An area of life, short: "Health", "Career", "Money", "Relationships", "Learning", "Home"'),
    projects: z.array(z.object({ name: z.string() })).max(3).optional().describe('One to three real things the user said are going on in it. Never filler.'),
  })).min(1).max(8),
  assumptions: z.array(z.string()).describe('What you assumed, plainly, because they did not say'),
})
export type AreasInput = z.infer<typeof AreasInputSchema>

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Areas (and, under them, projects) to add. What the user already has is never
 * created twice and never touched: an area that exists is reused as it is, and
 * a project of the same name already under it is left alone. What was skipped
 * is said, so nothing is silent.
 */
export function compileAreas(
  input: AreasInput,
  existing: { areas: { id: number; name: string }[]; projects: { name: string; areaId: number | null }[] },
): CompiledPlan & { skipped: string[] } {
  const operations: BatchOperation[] = []
  const skipped: string[] = []
  const seenAreas = new Set<string>()
  let created = 0
  let projectsMade = 0

  for (const area of input.areas) {
    const name = clean(area.name, 60)
    if (!name || seenAreas.has(norm(name))) continue
    seenAreas.add(norm(name))

    const have = existing.areas.find((a) => norm(a.name) === norm(name))
    let ref: string
    if (have) {
      ref = String(have.id)
      skipped.push(`You already have “${have.name}”.`)
    } else {
      ref = `$${operations.filter((o) => o.kind === 'createNode').length}`
      operations.push({ kind: 'createNode', type: 'Goal', properties: { name, status: 'active' } })
      created++
    }
    const seenProjects = new Set<string>()
    for (const proj of area.projects ?? []) {
      const pname = clean(proj.name, 80)
      if (!pname || seenProjects.has(norm(pname))) continue
      seenProjects.add(norm(pname))
      if (have && existing.projects.some((p) => p.areaId === have.id && norm(p.name) === norm(pname))) { skipped.push(`“${pname}” is already under ${have.name}.`); continue }
      const index = operations.filter((o) => o.kind === 'createNode').length
      operations.push({ kind: 'createNode', type: 'Project', properties: { name: pname, status: 'active' } })
      operations.push({ kind: 'createEdge', sourceRef: `$${index}`, targetRef: ref, type: 'part-of' })
      projectsMade++
    }
  }
  if (operations.length === 0) throw new Error('Everything in that is already there.')

  const assumed = input.assumptions.map((a) => clean(a, 160).replace(/^i\s+(?:have\s+)?assum(?:e|ed|ing)\s+(?:that\s+)?/i, '').replace(/[.;]+$/, '')).filter(Boolean)
  const summary = `Areas of life\n\n${created ? `${created} new area${created === 1 ? '' : 's'}` : 'No new areas'}${projectsMade ? `, ${projectsMade} project${projectsMade === 1 ? '' : 's'}` : ''}.${assumed.length ? ` Assumed: ${assumed.join('; ')}.` : ''}${skipped.length ? ` ${skipped.join(' ')}` : ''}`
  return { operations, summary, warnings: [], skipped }
}


// ── A plan is checked before the user sees it ───────────────────────────

const STOP = new Set(['on', 'the', 'a', 'an', 'and', 'to', 'of', 'in', 'at', 'for', 'your', 'my', 'easy', 'easily', 'gentle', 'gently', 'steady', 'steadily', 'every', 'each', 'monday', 'mondays', 'tuesday', 'tuesdays', 'wednesday', 'wednesdays', 'thursday', 'thursdays', 'friday', 'fridays', 'saturday', 'saturdays', 'sunday', 'sundays', 'session', 'sessions'])
const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, '')))
const similar = (a: string, b: string) => {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return false
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both) >= 0.5
}
const daysOf = (r: NonNullable<PlanInput['items'][number]['repeats']>) => (r.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : r.frequency === 'weekdays' ? [1, 2, 3, 4, 5] : r.days ?? [])

/**
 * What is wrong with the SHAPE of a plan, said as instructions to fix it. The
 * assistant gets these back and tries again, so a plan the user sees has
 * already passed: some one-off steps as well as routines, a first step soon,
 * phases once it is long, routines that do not pile up on each other.
 */
export function critiquePlan(input: PlanInput): string[] {
  const issues: string[] = []
  const items = input.items.filter((i) => i.title.trim())
  if (items.length >= 4 && items.every((i) => i.repeats)) {
    issues.push('Every step repeats. Add one-off steps too: set-up before the routine starts (get what is needed, book, decide), a first small step, and checkpoints.')
  }
  if (!items.some((i) => i.startOffsetDays <= 2)) {
    issues.push('Nothing starts within two days. Add a small first step (under 15 minutes) for today or tomorrow.')
  }
  if (items.length > 8 && (input.headings?.length ?? 0) < 2) {
    issues.push('More than 8 steps with no phases. Group them into 2 to 4 phases using headings (e.g. "Get ready", "Build", "Final stretch") and give each step a headingKey.')
  }
  const reps = items.filter((i) => i.repeats)
  const sameWeekly = new Set<string>()
  for (let a = 0; a < reps.length; a++) {
    for (let b = a + 1; b < reps.length; b++) {
      const A = reps[a]
      const B = reps[b]
      if (!similar(A.title, B.title)) continue
      const endA = A.repeats!.untilOffsetDays ?? Infinity
      const endB = B.repeats!.untilOffsetDays ?? Infinity
      const overlap = A.startOffsetDays <= endB && B.startOffsetDays <= endA
      const shared = daysOf(A.repeats!).some((d) => daysOf(B.repeats!).includes(d))
      if (overlap && shared) {
        issues.push(`“${A.title}” and “${B.title}” are the same routine overlapping on the same days. If one phase follows another, end the earlier one with untilOffsetDays (the day before the next starts); otherwise keep a single step.`)
      } else if (!shared && overlap && A.repeats!.frequency === 'weekly' && B.repeats!.frequency === 'weekly') {
        sameWeekly.add(`“${A.title}” and “${B.title}”`)
      }
    }
  }
  for (const pair of sameWeekly) issues.push(`${pair} are one routine on different days. Make it ONE weekly step with all its days.`)
  return [...new Set(issues)].slice(0, 5)
}
