import type { Edge, Node } from '@/lib/db/schema'
import { addDays } from '@/lib/date'
import { clockIn } from '@/lib/clock'

/**
 * Who the to-dos are making you.
 *
 * A finished to-do is more than a line struck through: it is a small piece
 * of evidence about the person who did it — we decide who we are partly by
 * watching what we do. So the user can name who they are becoming ("a
 * runner", "a good friend", "someone who ships"), say which of their lists,
 * habits and tags count toward each, and every tick from then on is a vote.
 *
 * Votes are read back from what is already in the graph — finished tasks and
 * kept habit days — rather than written anywhere new: nothing to keep in
 * step, nothing lost if a link is changed later, and the whole history
 * counts from the first day an identity is named. A vote never expires and
 * a missed day takes nothing away; that is deliberate (see WorldView).
 *
 * An Identity is a node like any other, so it is exported, synced and
 * deleted with the rest of the graph.
 */

export const WORLD_KINDS = ['sky', 'path', 'city'] as const
export type WorldKind = (typeof WORLD_KINDS)[number]

/** One colour per identity, chosen to read on the worlds' dark grounds. The brand's amber first. */
export const IDENTITY_COLORS = ['#F5A524', '#7dd3fc', '#fb7185', '#6ee7b7', '#c4b5fd', '#ff8552', '#bef264', '#5eead4'] as const
/** Votes that belong to no identity in particular: the everyday. */
export const EVERYDAY_COLOR = '#ece6d8'

export const colorOf = (group: number, hues: number[]) =>
  group < 0 ? EVERYDAY_COLOR : IDENTITY_COLORS[(hues[group] ?? group) % IDENTITY_COLORS.length]

export interface Identity {
  id: number
  /** Finishes "I'm becoming …": "a runner", "someone who writes". */
  name: string
  /** Index into IDENTITY_COLORS. */
  hue: number
  /** Areas and projects whose to-dos vote for it. A project counts for its area's identity too. */
  listIds: number[]
  /** Habits and repeating to-dos (by their first occurrence) that vote for it. */
  itemIds: number[]
  /** To-dos carrying any of these tags vote for it. */
  tags: string[]
  order: number
}

/** A vote, as the worlds draw it: how many days ago, and for whom (-1: the everyday). */
export type Vote = [age: number, group: number]

export interface WorldPayload {
  today: string
  identities: (Identity & { votes: number; week: number })[]
  everyday: { votes: number; week: number }
  /** Oldest first. */
  votes: Vote[]
}

const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [])
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [])

export function identityOf(n: Node): Identity {
  const p = (n.properties ?? {}) as Record<string, unknown>
  return {
    id: n.id,
    name: typeof p.name === 'string' ? p.name : '',
    hue: Number.isInteger(p.hue) ? (p.hue as number) : 0,
    listIds: nums(p.listIds),
    itemIds: nums(p.itemIds),
    tags: strs(p.tags),
    order: typeof p.order === 'number' ? p.order : n.id,
  }
}

/** The first colour no identity is wearing yet, so two never share one until they must. */
export function nextHue(identities: Pick<Identity, 'hue'>[]): number {
  const used = new Set(identities.map((i) => i.hue))
  for (let h = 0; h < IDENTITY_COLORS.length; h++) if (!used.has(h)) return h
  return identities.length % IDENTITY_COLORS.length
}

/**
 * Every vote in the graph, oldest first. Pure.
 *
 * A vote is a finished task (on the day it was finished, in the user's
 * zone) or a habit kept on a day; the five prayers count one each. Which
 * identity it is for is decided by the most specific link: the item itself,
 * then its project, then the project's area, then its tags — and among
 * identities claiming the same thing, the first in the user's order.
 */
export function collectVotes({ nodes, edges, identities, today, zone }: {
  nodes: Node[]
  edges: Edge[]
  identities: Identity[]
  today: string
  zone: string | null
}): Vote[] {
  const ordered = [...identities].sort((a, b) => a.order - b.order || a.id - b.id)
  const groupOf = new Map(ordered.map((idt, i) => [idt.id, i]))

  // Lists, and which area each project sits in.
  const kind = new Map<number, 'area' | 'project'>()
  for (const n of nodes) {
    if (n.type === 'Goal') kind.set(n.id, 'area')
    else if (n.type === 'Project') kind.set(n.id, 'project')
  }
  const linked = (id: number, want: 'area' | 'project') => {
    for (const e of edges) {
      if (e.type === 'scheduled-for') continue
      const other = e.sourceId === id ? e.targetId : e.targetId === id ? e.sourceId : null
      if (other !== null && kind.get(other) === want) return other
    }
    return null
  }
  const areaOfProject = new Map<number, number | null>()
  for (const [id, k] of kind) if (k === 'project') areaOfProject.set(id, linked(id, 'area'))
  const containerOf = (id: number) => linked(id, 'project') ?? linked(id, 'area')

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pick = (test: (idt: Identity) => boolean) => {
    const hit = ordered.find(test)
    return hit ? groupOf.get(hit.id)! : null
  }
  /** Which identity something votes for, from its id, its series' first id, its list and its tags. */
  const groupFor = (ids: number[], tags: string[]): number => {
    for (const id of ids) {
      const g = pick((idt) => idt.itemIds.includes(id))
      if (g !== null) return g
    }
    for (const id of ids) {
      const list = containerOf(id)
      if (list === null) continue
      const g = pick((idt) => idt.listIds.includes(list))
      if (g !== null) return g
      const area = areaOfProject.get(list)
      if (area != null) {
        const ga = pick((idt) => idt.listIds.includes(area))
        if (ga !== null) return ga
      }
    }
    const lower = tags.map((t) => t.toLowerCase())
    const g = pick((idt) => idt.tags.some((t) => lower.includes(t.toLowerCase())))
    return g ?? -1
  }

  /** The user's day of a timestamp: ISO from the app, or SQLite's "YYYY-MM-DD HH:MM:SS" in UTC. */
  const dayOf = (at: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at
    const when = new Date(at.includes('T') ? at : at.replace(' ', 'T') + 'Z')
    return isNaN(when.getTime()) ? today : clockIn(zone, when).date
  }
  const ageOf = (date: string) => Math.max(0, daysBetween(date, today))
  const votes: { date: string; group: number }[] = []

  for (const n of nodes) {
    const p = (n.properties ?? {}) as Record<string, unknown>
    if (n.type === 'Task' && p.status === 'done') {
      const at = typeof p.completedAt === 'string' ? p.completedAt : n.updatedAt
      const series = typeof p.seriesId === 'number' ? [n.id, p.seriesId] : [n.id]
      votes.push({ date: dayOf(at), group: groupFor(series, strs(p.tags)) })
    } else if (n.type === 'HabitLog' && typeof p.habitNodeId === 'number' && typeof p.date === 'string') {
      const habit = byId.get(p.habitNodeId)
      const hp = (habit?.properties ?? {}) as Record<string, unknown>
      const group = groupFor([p.habitNodeId], strs(hp.tags))
      // The prayer habit's day holds the five, each its own tick.
      const times = Array.isArray(p.prayers) ? p.prayers.length : p.completed === true ? 1 : 0
      for (let i = 0; i < times; i++) votes.push({ date: p.date, group })
    }
  }

  return votes
    .filter((v) => v.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((v) => [ageOf(v.date), v.group] as Vote)
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** The counts the screen shows beside each identity: all time, and the last seven days. */
export function tally(identities: Identity[], votes: Vote[]): Pick<WorldPayload, 'identities' | 'everyday'> {
  const ordered = [...identities].sort((a, b) => a.order - b.order || a.id - b.id)
  const all = new Array(ordered.length + 1).fill(0)
  const week = new Array(ordered.length + 1).fill(0)
  for (const [age, g] of votes) {
    const i = g < 0 ? ordered.length : g
    all[i]++
    if (age < 7) week[i]++
  }
  return {
    identities: ordered.map((idt, i) => ({ ...idt, votes: all[i], week: week[i] })),
    everyday: { votes: all[ordered.length], week: week[ordered.length] },
  }
}

/** The date `age` days before `today`. */
export const dateOfAge = (today: string, age: number) => addDays(today, -age)
