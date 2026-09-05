import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'
import { todayStr, isDueOn } from '@/lib/date'

// In-app reminders: no service worker, no push subscription, no new
// storage — just "what needs attention right now", computed fresh from
// existing Task/Habit/HabitLog nodes each time this is polled.
export async function GET() {
  const user = getCurrentUser()
  const today = todayStr()
  const dow = new Date(today + 'T00:00:00').getDay()

  const tasks = getNodes(user.id, { type: 'Task' })
  const items: { id: number; type: 'task' | 'habit'; label: string; reason: 'overdue' | 'due-today' | 'not-done-today' }[] = []

  for (const t of tasks) {
    const p = t.properties as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : 'todo'
    if (status === 'done') continue
    const dueDate = typeof p.dueDate === 'string' ? p.dueDate : null
    const name = typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : `Task #${t.id}`
    if (dueDate && dueDate < today) items.push({ id: t.id, type: 'task', label: name, reason: 'overdue' })
    else if (dueDate === today) items.push({ id: t.id, type: 'task', label: name, reason: 'due-today' })
  }

  const habits = getNodes(user.id, { type: 'Habit' })
  const habitLogs = getNodes(user.id, { type: 'HabitLog' })
  for (const h of habits) {
    const p = h.properties as Record<string, unknown>
    const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
    const daysOfWeek = Array.isArray(p.daysOfWeek) ? (p.daysOfWeek as number[]) : null
    if (!isDueOn(frequency, daysOfWeek, dow)) continue

    const hasLogToday = habitLogs.some((l) => {
      const lp = l.properties as Record<string, unknown>
      return lp.habitNodeId === h.id && lp.date === today
    })
    if (hasLogToday) continue

    const name = typeof p.name === 'string' ? p.name : `Habit #${h.id}`
    items.push({ id: h.id, type: 'habit', label: name, reason: 'not-done-today' })
  }

  return Response.json({ count: items.length, items })
}
