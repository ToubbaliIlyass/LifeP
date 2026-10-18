import { applyReminderChanges } from '@/lib/reminders'
import { nowFor } from '@/lib/reminders-server'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createEdge, deleteEdge, getEdges, getNodeById, getNodes, updateNode } from '@/lib/graph/queries'
import { todayStr } from '@/lib/date'
import { blockStartFor, nowMinutes, recordSignal } from '@/lib/availability'
import { setTaskStatus } from '@/lib/tasks'
import { moveTaskTime, setTaskTime } from '@/lib/task-time'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** A date, null to clear it, or undefined when the field was not sent or is not one. */
const day = (v: unknown) => (v === null ? null : typeof v === 'string' && DATE.test(v) ? v : undefined)

/** How a node stores "daily" | "weekdays" | "weekly"; weekly repeats on `day`'s weekday. */
function recurrenceFor(repeats: unknown, day: string): { frequency: string; daysOfWeek?: number[] } | null {
  if (repeats === 'daily') return { frequency: 'daily' }
  if (repeats === 'weekdays') return { frequency: 'weekdays', daysOfWeek: [1, 2, 3, 4, 5] }
  if (repeats === 'weekly') return { frequency: 'weekly', daysOfWeek: [new Date(day + 'T00:00:00').getDay()] }
  return null
}

function put(props: Record<string, unknown>, key: string, value: unknown) {
  if (value === null || value === '' || value === false) delete props[key]
  else props[key] = value
}

/**
 * Moves `nodeId` into a list, or out of every list when `targetId` is null.
 *
 * Membership is an edge, so that the assistant and the planner see the same
 * thing the sidebar does. Only links to lists of the kinds given are cut — a
 * to-do related to something else entirely keeps that link.
 */
async function relink(userId: number, nodeId: number, targetId: number | null, kinds: string[]) {
  const [nodes, edges] = await Promise.all([getNodes(userId), getEdges(userId)])
  const typeById = new Map(nodes.map((n) => [n.id, n.type]))
  if (targetId !== null && !kinds.includes(typeById.get(targetId) ?? '')) return false

  let linked = false
  for (const e of edges) {
    if (e.type === 'scheduled-for') continue
    const other = e.sourceId === nodeId ? e.targetId : e.targetId === nodeId ? e.sourceId : null
    if (other === null || !kinds.includes(typeById.get(other) ?? '')) continue
    if (other === targetId && !linked) { linked = true; continue }
    await deleteEdge(userId, e.id)
  }
  if (targetId !== null && !linked) await createEdge(userId, nodeId, targetId, 'part-of')
  return true
}

/**
 * Changes a to-do or a list, in the screen's words.
 *
 * The screen speaks of a title, a day, a deadline, a list; each node type
 * keeps those under its own field names (src/lib/todos.ts reads them out,
 * this writes them back). Only the fields sent are touched.
 *
 * Body, all optional: { title, notes, when, evening, someday, deadline,
 *   repeats, reminder, time, minutes, tags, checklist, order, listId, headingId,
 *   headings, areaId, done }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const node = await getNodeById(user.id, id)
  if (!node || !['Task', 'Habit', 'Project', 'Goal'].includes(node.type)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const props = { ...(node.properties as Record<string, unknown>) }
  const dayBefore = typeof props.dueDate === 'string' ? props.dueDate : null
  const isList = node.type === 'Project' || node.type === 'Goal'

  if (typeof body.title === 'string') props.name = body.title.trim().slice(0, 300)
  if (typeof body.notes === 'string') put(props, isList ? 'description' : 'notes', body.notes)
  if (typeof body.order === 'number') props.order = body.order
  if (Array.isArray(body.tags)) put(props, 'tags', body.tags.length ? body.tags : null)

  // A to-do or a habit: when it reminds you. See src/lib/reminders.ts.
  if (node.type === 'Task' || node.type === 'Habit') applyReminderChanges(props, body, await nowFor(user.id, body))

  if (isList) {
    // A project's headings, whole: the screen sends the list as it now stands.
    if (node.type === 'Project' && Array.isArray(body.headings)) {
      const headings = body.headings.flatMap((h) => {
        const item = (h ?? {}) as Record<string, unknown>
        if (typeof item.id !== 'string' || typeof item.title !== 'string') return []
        return [{ id: item.id, title: item.title.slice(0, 200), ...(typeof item.note === 'string' ? { note: item.note.slice(0, 5000) } : {}) }]
      })
      put(props, 'headings', headings.length ? headings : null)
    }
    const deadline = day(body.deadline)
    if (deadline !== undefined) put(props, node.type === 'Goal' ? 'targetDate' : 'dueDate', deadline)
    if (typeof body.done === 'boolean') {
      props.status = body.done ? 'completed' : 'active'
      put(props, 'completedAt', body.done ? new Date().toISOString() : null)
    }
  } else if (node.type === 'Task') {
    // A day and "someday" are answers to the same question, so each clears
    // the other — and a to-do parked for someday is no longer the planner's.
    const when = day(body.when)
    if (when !== undefined) {
      put(props, 'dueDate', when)
      if (when) delete props.someday
    }
    if (body.someday === true) {
      props.someday = true
      delete props.dueDate
      delete props.evening
    } else if (body.someday === false) {
      delete props.someday
    }
    if (typeof body.evening === 'boolean') put(props, 'evening', body.evening)
    if ('priority' in body) props.priority = body.priority === 'high' || body.priority === 'low' ? body.priority : 'medium'
    const deadline = day(body.deadline)
    if (deadline !== undefined) put(props, 'deadline', deadline)
    if (Array.isArray(body.checklist)) put(props, 'checklist', body.checklist.length ? body.checklist : null)
    // A heading belongs to one project, so leaving the project leaves it too.
    if ('headingId' in body) put(props, 'headingId', typeof body.headingId === 'string' ? body.headingId : null)
    else if ('listId' in body) delete props.headingId
    // Read after `when`, so "every Thursday" follows the day just chosen.
    // A time is a time on a day: given one with no day yet, it is for today.
    const time = body.time === null ? null : typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : undefined
    if (time && typeof props.dueDate !== 'string') { props.dueDate = todayStr(); delete props.someday }
    if (typeof body.minutes === 'number' && body.minutes > 0) props.estimatedMinutes = Math.min(Math.round(body.minutes), 8 * 60)
    if ('repeats' in body) {
      put(props, 'recurrence', recurrenceFor(body.repeats, typeof props.dueDate === 'string' ? props.dueDate : todayStr()))
    }
  } else if (node.type === 'Habit' && 'repeats' in body) {
    // A habit keeps the same answer in its own two fields, and always repeats.
    const rule = recurrenceFor(body.repeats, todayStr())
    if (rule) {
      props.frequency = rule.frequency
      put(props, 'daysOfWeek', rule.daysOfWeek ?? null)
    }
  }

  await updateNode(user.id, id, props)

  // The clock, after the day is settled: a moved day takes its time along.
  if (node.type === 'Task') {
    const dayNow = typeof props.dueDate === 'string' ? props.dueDate : null
    if (dayBefore && dayBefore !== dayNow) await moveTaskTime(user.id, id, dayBefore, dayNow)
    const time = body.time === null ? null : typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : undefined
    if (dayNow && (time !== undefined || typeof body.minutes === 'number')) {
      await setTaskTime(user.id, id, dayNow, { time, minutes: typeof body.minutes === 'number' ? body.minutes : (props.estimatedMinutes as number | undefined) ?? null })
    }
  }

  if ('listId' in body && !isList) {
    const ok = await relink(user.id, id, typeof body.listId === 'number' ? body.listId : null, ['Project', 'Goal'])
    if (!ok) return Response.json({ error: 'List not found' }, { status: 404 })
  }
  if ('areaId' in body && node.type === 'Project') {
    const ok = await relink(user.id, id, typeof body.areaId === 'number' ? body.areaId : null, ['Goal'])
    if (!ok) return Response.json({ error: 'Area not found' }, { status: 404 })
  }

  // Done goes last and through the one place that knows what it entails: the
  // timestamp, and a repeating to-do handing off to its next occurrence.
  let spawned: { id: number } | null = null
  if (node.type === 'Task' && typeof body.done === 'boolean') {
    const change = await setTaskStatus(user.id, id, body.done ? 'done' : 'todo')
    spawned = change?.spawned ?? null
    // When it actually got done is what the planner learns from: the slot it
    // was planned in if there was one, otherwise right now.
    if (change && body.done && change.previous !== 'done') {
      const today = todayStr()
      await recordSignal(user.id, {
        kind: 'done',
        itemType: 'Task',
        itemId: id,
        name: typeof props.name === 'string' ? props.name : `Task #${id}`,
        date: today,
        minute: (await blockStartFor(user.id, id, today)) ?? nowMinutes(),
      })
    }
  }

  return Response.json({ ok: true, spawned })
}
