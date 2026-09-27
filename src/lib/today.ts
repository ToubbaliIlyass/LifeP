import { addDays, isDueOn } from '@/lib/date'
import { collectWork, goalProgress, lastActivityFor } from '@/lib/goals'
import { displayName } from '@/lib/graph/naming'
import type { Node, Edge } from '@/lib/db/schema'

/**
 * What the dashboard says beyond "what now".
 *
 * The rule for everything here is that it must not repeat the Now timeline.
 * Today used to list habits, tasks and events in their own sections while
 * Now listed the same items above them — so the page got longer the busier
 * the day was, and said the same thing three times. These are the answers
 * Now cannot give: what is moving, what slipped, and what is being left out.
 *
 * Pure, so the rules can be exercised against fixed data.
 */

/**
 * Properties are free-form JSON, and a `dueDate` written by hand or by the
 * assistant is not always a date — "TBD" and "next semester" are both in
 * this graph. Anything that is not a real day is treated as no date at all
 * rather than rendered as one or sorted as one.
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/
const dateOrNull = (value: unknown) => (typeof value === 'string' && DATE.test(value) ? value : null)

const nameOf = (p: Record<string, unknown>, fallback: string) =>
  typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : fallback

const daysBetween = (from: string, to: string) =>
  Math.max(0, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000))

export interface ActiveProject {
  id: number
  name: string
  dueDate: string | null
  /** null when nothing is linked to it yet. */
  progress: number | null
  done: number
  total: number
  lastActivity: string | null
  daysQuiet: number | null
}

/**
 * The projects actually under way, with how far along they are.
 *
 * Ordered by what is closest to needing attention: a deadline first, then
 * whatever has been quiet longest — a project nobody has touched in a
 * fortnight is the one worth seeing.
 */
export function activeProjects(
  { today, nodes, edges, habitLogs, limit = 5 }:
  { today: string; nodes: Node[]; edges: Edge[]; habitLogs: Node[]; limit?: number },
): ActiveProject[] {
  const projects = nodes.filter((n) => {
    if (n.type !== 'Project') return false
    const p = n.properties as Record<string, unknown>
    if (p.archived === true) return false
    const status = typeof p.status === 'string' ? p.status : 'active'
    return status !== 'completed' && status !== 'cancelled' && status !== 'abandoned'
  })

  const work = collectWork(projects, nodes, edges)
  const since = addDays(today, -7)

  return projects
    .map((project) => {
      const p = project.properties as Record<string, unknown>
      const w = work.get(project.id)!
      const { progress, counted, done } = goalProgress(w, habitLogs, since)
      const lastActivity = lastActivityFor(w, habitLogs) ?? project.updatedAt.slice(0, 10)
      return {
        id: project.id,
        name: displayName(project.type, p),
        dueDate: dateOrNull(p.dueDate),
        progress,
        done,
        total: counted,
        lastActivity,
        daysQuiet: lastActivity ? daysBetween(lastActivity, today) : null,
      }
    })
    .sort((a, b) => {
      // A dated project outranks an undated one, soonest first.
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate && !b.dueDate) return -1
      if (!a.dueDate && b.dueDate) return 1
      return (b.daysQuiet ?? 0) - (a.daysQuiet ?? 0)
    })
    .slice(0, limit)
}

export interface GoalNudge {
  id: number
  name: string
  lastActivity: string | null
  daysQuiet: number | null
}

/**
 * One goal, on the days a goal is being neglected.
 *
 * A list of every goal is wallpaper — it is on screen every day, so it stops
 * being read. One is a question you can actually answer. Which one rotates
 * by the date rather than being picked at random, so it is the same goal all
 * day however many times the page is opened, and a different one tomorrow
 * instead of the same one forever.
 *
 * Nothing is shown at all when every goal has had attention recently: a
 * nudge that appears unconditionally is a nudge nobody believes.
 */
export function pickGoalNudge(
  { today, nodes, edges, habitLogs, minDaysQuiet = 4 }:
  { today: string; nodes: Node[]; edges: Edge[]; habitLogs: Node[]; minDaysQuiet?: number },
): GoalNudge | null {
  const goals = nodes.filter((n) => {
    if (n.type !== 'Goal') return false
    const p = n.properties as Record<string, unknown>
    if (p.archived === true) return false
    return (typeof p.status === 'string' ? p.status : 'active') === 'active'
  })
  if (goals.length === 0) return null

  const work = collectWork(goals, nodes, edges)
  const neglected = goals
    .map((goal) => {
      const p = goal.properties as Record<string, unknown>
      const lastActivity = lastActivityFor(work.get(goal.id)!, habitLogs)
      return {
        id: goal.id,
        name: displayName(goal.type, p),
        lastActivity,
        daysQuiet: lastActivity ? daysBetween(lastActivity, today) : null,
      }
    })
    // Nothing linked at all counts as the most neglected of the lot.
    .filter((g) => g.daysQuiet === null || g.daysQuiet >= minDaysQuiet)
    .sort((a, b) => (b.daysQuiet ?? 9999) - (a.daysQuiet ?? 9999) || a.id - b.id)

  if (neglected.length === 0) return null
  const dayIndex = Math.floor(new Date(today + 'T00:00:00').getTime() / 86_400_000)
  return neglected[dayIndex % neglected.length]
}

export interface Pulse {
  /** Habit completion over the last seven days. */
  habits: { due: number; done: number; rate: number | null }
  /** Tasks finished in the last seven days, and how many are late right now. */
  tasks: { completed: number; overdue: number }
  /** What was due yesterday and not done — the thing Now cannot tell you. */
  yesterday: { date: string; due: number; done: number; missed: string[] }
}

/**
 * How the week has actually gone, in three numbers.
 *
 * A rolling seven days rather than the calendar week the Activity tab uses:
 * on a Monday morning "this week" is one day long and says nothing, and the
 * question here is "how am I doing", not "how did that week end".
 */
export function buildPulse(
  { today, nodes, habitLogs }: { today: string; nodes: Node[]; habitLogs: Node[] },
): Pulse {
  const habits = nodes.filter((n) => n.type === 'Habit' && (n.properties as Record<string, unknown>).archived !== true)
  const logged = (habitId: number, date: string) =>
    habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === habitId && lp.date === date && lp.completed === true
    })

  let due = 0
  let done = 0
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, -i)
    const dow = new Date(date + 'T00:00:00').getDay()
    for (const habit of habits) {
      const p = habit.properties as Record<string, unknown>
      const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
      const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
      if (!isDueOn(frequency, daysOfWeek, dow)) continue
      due++
      if (logged(habit.id, date)) done++
    }
  }

  const yesterday = addDays(today, -1)
  const yesterdayDow = new Date(yesterday + 'T00:00:00').getDay()
  const yesterdayDue = habits.filter((h) => {
    const p = h.properties as Record<string, unknown>
    return isDueOn(
      typeof p.frequency === 'string' ? p.frequency : 'daily',
      Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null,
      yesterdayDow,
    )
  })
  const missed = yesterdayDue.filter((h) => !logged(h.id, yesterday))

  const weekAgo = addDays(today, -7)
  let completed = 0
  let overdue = 0
  for (const task of nodes) {
    if (task.type !== 'Task') continue
    const p = task.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : 'todo'
    const completedAt = typeof p.completedAt === 'string' ? p.completedAt.slice(0, 10) : null
    const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
    if (completedAt && completedAt >= weekAgo && completedAt <= today) completed++
    if (status !== 'done' && p.archived !== true && dueDate && dueDate < today) overdue++
  }

  return {
    habits: { due, done, rate: due > 0 ? Math.round((done / due) * 100) : null },
    tasks: { completed, overdue },
    yesterday: {
      date: yesterday,
      due: yesterdayDue.length,
      done: yesterdayDue.length - missed.length,
      missed: missed.map((h) => nameOf(h.properties as Record<string, unknown>, `Habit #${h.id}`)).slice(0, 4),
    },
  }
}
