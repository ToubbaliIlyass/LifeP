import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function calculateStreak(logs: Array<{ date: string; completed: boolean }>): number {
  const completedDates = new Set(
    logs.filter((l) => l.completed).map((l) => l.date),
  )
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (completedDates.has(ds)) streak++
    else break
  }
  return streak
}

export async function GET() {
  const user = getCurrentUser()
  const today = todayStr()

  const habits = getNodes(user.id, { type: 'Habit' })
  const allLogs = getNodes(user.id, { type: 'HabitLog' })

  const result = habits.map((habit) => {
    const props = habit.properties as Record<string, unknown>
    const logs = allLogs
      .map((n) => n.properties as Record<string, unknown>)
      .filter((p) => p.habitNodeId === habit.id)
      .map((p) => ({ date: String(p.date ?? ''), completed: Boolean(p.completed) }))

    const todayLog = logs.find((l) => l.date === today)

    return {
      id: habit.id,
      name: typeof props.name === 'string' ? props.name : typeof props.title === 'string' ? props.title : `Habit #${habit.id}`,
      frequency: typeof props.frequency === 'string' ? props.frequency : 'daily',
      durationMinutes: typeof props.durationMinutes === 'number' ? props.durationMinutes : null,
      todayCompleted: todayLog?.completed ?? false,
      streak: calculateStreak(logs),
    }
  })

  return Response.json({ habits: result, date: today })
}
