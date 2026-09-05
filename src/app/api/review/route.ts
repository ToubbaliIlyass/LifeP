import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes, getNodeWithNeighbors } from '@/lib/graph/queries'
import { todayStr, addDays, isDueOn } from '@/lib/date'

const STALE_GOAL_DAYS = 14

// Aggregates purely from existing node data (Habit/HabitLog/Task/Goal) —
// nothing new is stored, so a review for any past week is always computable
// after the fact, and can't drift from what actually happened.
export async function GET(request: Request) {
  const user = getCurrentUser()
  const { searchParams } = new URL(request.url)
  const weekStart = searchParams.get('weekStart') || todayStr()
  const weekEnd = addDays(weekStart, 6)

  // ── Habits: completion rate over days each habit was actually due ──
  const habits = await getNodes(user.id, { type: 'Habit' })
  const habitLogs = await getNodes(user.id, { type: 'HabitLog' })

  let habitDueCount = 0
  let habitDoneCount = 0
  const habitBreakdown = habits.map((habit) => {
    const p = habit.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    const name = typeof p.name === 'string' ? p.name : `Habit #${habit.id}`

    let due = 0
    let done = 0
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i)
      if (date > todayStr()) break // don't count days that haven't happened yet
      const dow = new Date(date + 'T00:00:00').getDay()
      if (!isDueOn(frequency, daysOfWeek, dow)) continue
      due++
      const completed = habitLogs.some((l) => {
        const lp = l.properties as Record<string, unknown>
        return lp.habitNodeId === habit.id && lp.date === date && lp.completed === true
      })
      if (completed) done++
    }
    habitDueCount += due
    habitDoneCount += done
    return { id: habit.id, name, due, done }
  }).filter((h) => h.due > 0)

  // ── Tasks: completed vs. created vs. still-overdue, within the week ──
  const tasks = await getNodes(user.id, { type: 'Task' })
  let tasksCompleted = 0
  let tasksCreated = 0
  let tasksOverdue = 0
  for (const t of tasks) {
    const p = t.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : 'todo'
    const completedAt = typeof p.completedAt === 'string' ? p.completedAt.slice(0, 10) : null
    const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
    const createdDate = t.createdAt.slice(0, 10)

    if (completedAt && completedAt >= weekStart && completedAt <= weekEnd) tasksCompleted++
    if (createdDate >= weekStart && createdDate <= weekEnd) tasksCreated++
    if (status !== 'done' && dueDate && dueDate < weekStart) tasksOverdue++
  }

  // ── Goals: flag any active goal with no linked-node activity recently ──
  const goals = (await getNodes(user.id, { type: 'Goal' })).filter((g) => {
    const p = g.properties as Record<string, unknown>
    return (p.status ?? 'active') === 'active'
  })
  const staleCutoff = addDays(todayStr(), -STALE_GOAL_DAYS)
  const staleGoals = (await Promise.all(goals
    .map(async (g) => {
      const p = g.properties as Record<string, unknown>
      const detail = await getNodeWithNeighbors(user.id, g.id)
      const linked = (detail?.neighbors ?? []).filter((n) => n.node.type === 'Task' || n.node.type === 'Habit')
      const mostRecentActivity = linked.reduce<string | null>((latest, { node }) => {
        const updated = node.updatedAt.slice(0, 10)
        return !latest || updated > latest ? updated : latest
      }, null)
      return {
        id: g.id,
        name: typeof p.name === 'string' ? p.name : `Goal #${g.id}`,
        lastActivity: mostRecentActivity,
      }
    })))
    .filter((g) => !g.lastActivity || g.lastActivity < staleCutoff)

  return Response.json({
    weekStart,
    weekEnd,
    habits: {
      due: habitDueCount,
      done: habitDoneCount,
      rate: habitDueCount > 0 ? Math.round((habitDoneCount / habitDueCount) * 100) : null,
      breakdown: habitBreakdown,
    },
    tasks: { completed: tasksCompleted, created: tasksCreated, overdue: tasksOverdue },
    staleGoals,
  })
}
