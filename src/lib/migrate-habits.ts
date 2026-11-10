import type { Client, InStatement } from '@libsql/client'
import { PRAYERS, PRAYER_LABELS } from '@/lib/prayer-times'
import { isDueOn, nextDueDate } from '@/lib/date'

/**
 * Habits become repeating to-dos, once.
 *
 * Habit and HabitLog are gone from the app. What used to be a Habit is a Task
 * with a recurrence, and the days the five prayers were kept become `doneDates`
 * on five prayer Tasks (see src/lib/prayers.ts). Edges move to the new Task, so
 * a goal link or a place on the calendar survives. Everything removed is
 * returned in `backup`, for the caller to write down before anything is lost.
 *
 * Takes a libsql client rather than the app's own, so it can run against any
 * file; scripts/migrate-habits-to-tasks.ts is the way to run it.
 */

type Row = { id: number; user_id: number; type: string; properties: string }
type EdgeRow = { id: number; user_id: number; source_id: number; target_id: number; type: string; properties: string }

export interface HabitMigrationResult {
  tasksMade: number
  prayerDaysKept: number
  habitsDeleted: number
  logsDeleted: number
  backup: { nodes: Row[]; edges: EdgeRow[] }
}

const parse = (s: string): Record<string, unknown> => {
  try { return JSON.parse(s) as Record<string, unknown> } catch { return {} }
}
const isPrayerKey = (k: unknown): k is (typeof PRAYERS)[number] => typeof k === 'string' && (PRAYERS as readonly string[]).includes(k)

export async function migrateHabits(
  client: Client,
  today: string,
  /** Called with everything about to be removed, before anything is written: the place to save the backup. */
  beforeWrite?: (backup: HabitMigrationResult['backup']) => void | Promise<void>,
): Promise<HabitMigrationResult> {
  const nodes = (await client.execute("select id, user_id, type, properties from nodes where type in ('Habit', 'HabitLog')")).rows as unknown as Row[]
  const ids = nodes.map((n) => Number(n.id))
  const edges = ids.length
    ? ((await client.execute('select id, user_id, source_id, target_id, type, properties from edges')).rows as unknown as EdgeRow[])
        .filter((e) => ids.includes(Number(e.source_id)) || ids.includes(Number(e.target_id)))
    : []
  const settings = (await client.execute("select id, user_id, properties from nodes where type = 'Settings'")).rows as unknown as Row[]

  const result: HabitMigrationResult = {
    tasksMade: 0, prayerDaysKept: 0, habitsDeleted: 0, logsDeleted: 0,
    backup: { nodes: nodes.map((n) => ({ ...n, id: Number(n.id), user_id: Number(n.user_id) })), edges: edges.map((e) => ({ ...e, id: Number(e.id), user_id: Number(e.user_id), source_id: Number(e.source_id), target_id: Number(e.target_id) })) },
  }
  if (nodes.length === 0 && settings.every((s) => parse(s.properties).prayer === undefined || (parse(s.properties).prayer as Record<string, unknown>).habitNodeId === undefined)) return result

  await beforeWrite?.(result.backup)
  const tx = await client.transaction('write')
  try {
    const run = (stmt: InStatement) => tx.execute(stmt)
    const users = [...new Set(nodes.map((n) => Number(n.user_id)))]

    for (const userId of users) {
      const mine = nodes.filter((n) => Number(n.user_id) === userId)
      const stored = settings.find((s) => Number(s.user_id) === userId)
      const storedId = (parse(stored?.properties ?? '{}').prayer as { habitNodeId?: unknown } | undefined)?.habitNodeId
      const isPrayerHabit = (n: Row) => {
        if (n.type !== 'Habit') return false
        const name = parse(n.properties).name
        return Number(n.id) === storedId || (typeof name === 'string' && /\bpray(er|ers|ing)?\b|salah|salat/i.test(name))
      }
      const prayerHabitIds = new Set(mine.filter(isPrayerHabit).map((n) => Number(n.id)))

      // The five, with the days each was kept.
      const days = new Map<string, Set<string>>(PRAYERS.map((k) => [k, new Set<string>()]))
      for (const log of mine.filter((n) => n.type === 'HabitLog')) {
        const p = parse(log.properties)
        if (!prayerHabitIds.has(Number(p.habitNodeId)) || typeof p.date !== 'string' || !Array.isArray(p.prayers)) continue
        for (const k of p.prayers) if (isPrayerKey(k)) { days.get(k)!.add(p.date); result.prayerDaysKept++ }
      }
      if (result.prayerDaysKept > 0 || prayerHabitIds.size > 0) {
        const have = (await run({ sql: "select id, properties from nodes where user_id = ? and type = 'Task'", args: [userId] })).rows
        for (const k of PRAYERS) {
          const existing = have.find((r) => parse(String(r.properties)).prayer === k)
          if (existing) {
            const p = parse(String(existing.properties))
            const merged = [...new Set([...(Array.isArray(p.doneDates) ? (p.doneDates as string[]) : []), ...days.get(k)!])].sort()
            await run({ sql: 'update nodes set properties = ? where id = ?', args: [JSON.stringify({ ...p, doneDates: merged }), Number(existing.id)] })
          } else {
            await run({
              sql: 'insert into nodes (user_id, type, properties) values (?, ?, ?)',
              args: [userId, 'Task', JSON.stringify({
                name: PRAYER_LABELS[k], prayer: k, recurrence: { frequency: 'daily' }, status: 'todo',
                doneDates: [...days.get(k)!].sort(), order: PRAYERS.indexOf(k) - 10,
              })],
            })
            result.tasksMade++
          }
        }
      }

      // Every other habit: a Task that comes back, with its edges.
      for (const habit of mine.filter((n) => n.type === 'Habit' && !prayerHabitIds.has(Number(n.id)))) {
        const p = parse(habit.properties)
        const frequency = typeof p.frequency === 'string' ? p.frequency : 'daily'
        const daysOfWeek = Array.isArray(p.daysOfWeek) && p.daysOfWeek.length ? (p.daysOfWeek as number[]) : null
        const dueDate = isDueOn(frequency, daysOfWeek, new Date(today + 'T00:00:00').getDay()) ? today : nextDueDate(today, frequency, daysOfWeek)
        const props: Record<string, unknown> = {
          name: typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : 'Untitled',
          status: 'todo',
          dueDate,
          recurrence: { frequency, ...(daysOfWeek ? { daysOfWeek } : {}) },
        }
        for (const k of ['notes', 'tags', 'order', 'evening', 'reminder', 'remindBefore'] as const) if (p[k] !== undefined) props[k] = p[k]
        if (typeof p.durationMinutes === 'number' && p.durationMinutes > 0) props.estimatedMinutes = p.durationMinutes
        const made = await run({ sql: 'insert into nodes (user_id, type, properties) values (?, ?, ?) returning id', args: [userId, 'Task', JSON.stringify(props)] })
        const newId = Number(made.rows[0].id)
        result.tasksMade++
        await run({ sql: 'update edges set source_id = ? where source_id = ?', args: [newId, Number(habit.id)] })
        await run({ sql: 'update edges set target_id = ? where target_id = ?', args: [newId, Number(habit.id)] })
      }
    }

    // The habit nodes and their logs go; edges still on them go with them.
    for (const n of nodes) await run({ sql: 'delete from nodes where id = ?', args: [Number(n.id)] })
    result.habitsDeleted = nodes.filter((n) => n.type === 'Habit').length
    result.logsDeleted = nodes.filter((n) => n.type === 'HabitLog').length

    // Settings no longer point at a habit.
    for (const s of settings) {
      const p = parse(s.properties)
      const prayer = p.prayer as Record<string, unknown> | undefined
      if (prayer && 'habitNodeId' in prayer) {
        delete prayer.habitNodeId
        await run({ sql: 'update nodes set properties = ? where id = ?', args: [JSON.stringify(p), Number(s.id)] })
      }
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback()
    throw error
  } finally {
    tx.close()
  }
  return result
}
