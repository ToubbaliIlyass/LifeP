import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { createNode, createEdge, getNodeById } from '@/lib/graph/queries'
import { readSettings, writeSettings } from '@/lib/settings'
import { saveRule } from '@/lib/availability'
import { todayStr } from '@/lib/date'
import { hiddenTypes } from '@/lib/modules'

/**
 * The answers from the setup interview, written in one go.
 *
 * Everything here exists because the app used to start knowing nothing. The
 * scheduler had no idea when this person is in class, what they are working
 * towards, or when they usually train — so its first weeks of plans were
 * guesses, and the learning had nothing to learn from until enough clicks had
 * piled up. A person can say all of it in three minutes; asking is cheaper
 * than inferring, and far cheaper than being wrong for a fortnight.
 *
 * The one rule: a stated time becomes a stated rule, not a fake history.
 * Inventing ActivitySignals to mean "they said they run at seven" would put
 * a lie in the evidence the learning trusts most, and nothing downstream
 * could ever tell it from something that really happened. Stated preferences
 * already outrank learned ones (src/lib/availability.ts), which is exactly
 * the behaviour wanted: plan it there now, and let reality correct it later.
 */

interface Payload {
  modules?: Record<string, boolean>
  /** Fixed, named, recurring commitments: classes, shifts, training. */
  commitments?: {
    name: string
    frequency?: string
    daysOfWeek?: number[]
    time?: string
    duration?: number
    location?: string
    /** The Course this is a meeting of, when it came from Canvas. */
    courseNodeId?: number
  }[]
  habits?: {
    name: string
    /** Index into `goals`, when the habit is in service of one. */
    goal?: number | null
    frequency?: string
    daysOfWeek?: number[]
    durationMinutes?: number
    /** Whole-day habits (praying, water) never get a slot. */
    anytime?: boolean
    /** When they usually do it, if they said. */
    usualTime?: string
  }[]
  goals?: { name: string; targetDate?: string | null }[]
  projects?: { name: string; goal?: number | null }[]
  /** Hours they are simply not available, as stated rules. */
  busy?: { days: number[]; start: string; end: string; note?: string }[]
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const FREQUENCIES = ['daily', 'weekdays', 'weekly']

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Payload
  const created: Record<string, number> = { commitments: 0, habits: 0, goals: 0, projects: 0, rules: 0, links: 0 }

  // Settings first: what follows is filtered by the modules chosen here, so a
  // stray habit from a section they turned off cannot slip in behind it.
  const settings = await readSettings(user.id)
  await writeSettings(user.id, {
    ...(body.modules ? { modules: { ...settings.modules, ...body.modules } } : {}),
    onboarding: { completed: true, completedAt: new Date().toISOString() },
  })
  const off = hiddenTypes({ modules: { ...settings.modules, ...(body.modules ?? {}) } })

  const goalIdByIndex: number[] = []
  for (const goal of body.goals ?? []) {
    if (!goal.name?.trim()) continue
    const node = await createNode(user.id, 'Goal', {
      name: goal.name.trim(),
      status: 'active',
      ...(goal.targetDate ? { targetDate: goal.targetDate } : {}),
    })
    goalIdByIndex.push(node.id)
    created.goals++
  }

  for (const project of body.projects ?? []) {
    if (!project.name?.trim()) continue
    const node = await createNode(user.id, 'Project', { name: project.name.trim(), status: 'active' })
    created.projects++
    // Said to serve a goal at the moment it was named — the one time the
    // relationship is unambiguous, so it is recorded rather than guessed at
    // later by a model reading two names side by side.
    const goalId = typeof project.goal === 'number' ? goalIdByIndex[project.goal] : undefined
    if (goalId) {
      await createEdge(user.id, node.id, goalId, 'supports', {})
      created.links++
    }
  }

  /*
   * A named, recurring thing that happens at a time is an Event, not an
   * availability rule — it belongs on the calendar where it can be seen,
   * moved and cancelled. The scheduler already treats Events as busy time,
   * so nothing is lost by putting it where the user can look at it.
   */
  for (const c of body.commitments ?? []) {
    if (!c.name?.trim() || !c.time || !TIME.test(c.time)) continue
    const frequency = FREQUENCIES.includes(c.frequency ?? '') ? c.frequency! : 'weekly'

    /*
     * A class knows which course it is a meeting of.
     *
     * Canvas has the course but not the timetable — most universities keep
     * meeting times in a student system Canvas never sees — so setup offers
     * each course as a row with no time on it and the user says when it
     * meets. The link is the point: it comes from the row having been that
     * course's row, rather than from a model later reading "Analysis" on an
     * event and "Analysis I" on a course and hoping.
     *
     * Recorded twice, as `courseNodeId` and as a part-of edge, because that
     * is how Assignments and Exams already do it (src/lib/canvas.ts) and the
     * school views read the property while the graph reads the edge.
     */
    const course = typeof c.courseNodeId === 'number'
      ? await getNodeById(user.id, c.courseNodeId)
      : null
    const linked = course?.type === 'Course' ? course : null

    const event = await createNode(user.id, 'Event', {
      name: c.name.trim(),
      date: todayStr(),
      time: c.time,
      duration: typeof c.duration === 'number' && c.duration > 0 ? c.duration : 60,
      frequency,
      ...(c.daysOfWeek?.length ? { daysOfWeek: c.daysOfWeek } : {}),
      ...(c.location?.trim() ? { location: c.location.trim() } : {}),
      ...(linked ? { courseNodeId: linked.id } : {}),
    })
    if (linked) {
      await createEdge(user.id, event.id, linked.id, 'part-of', {})
      created.links++
    }
    created.commitments++
  }

  for (const h of body.habits ?? []) {
    if (!h.name?.trim()) continue
    const frequency = FREQUENCIES.includes(h.frequency ?? '') ? h.frequency! : 'daily'
    const node = await createNode(user.id, 'Habit', {
      name: h.name.trim(),
      frequency,
      ...(h.daysOfWeek?.length ? { daysOfWeek: h.daysOfWeek } : {}),
      ...(typeof h.durationMinutes === 'number' ? { durationMinutes: h.durationMinutes } : {}),
      ...(h.anytime ? { anytime: true } : {}),
    })
    created.habits++

    /*
     * A habit that serves a goal says so, in an edge.
     *
     * Setup used to write a dozen nodes and almost no edges, which produced
     * exactly the graph it was meant to avoid: a ring of unconnected dots
     * around a root, where nothing could answer "what is this in aid of".
     * The moment somebody names the goal their running is for is the one
     * moment that link is unambiguous, so it is recorded rather than left
     * for a model to guess at later from two names sitting side by side.
     */
    const habitGoalId = typeof h.goal === 'number' ? goalIdByIndex[h.goal] : undefined
    if (habitGoalId) {
      await createEdge(user.id, node.id, habitGoalId, 'supports', {})
      created.links++
    }

    // "I train at seven" is a preference about a named activity, which is
    // exactly what a 'prefer' rule is for. The planner reads it on the very
    // first day, before any evidence exists.
    if (h.usualTime && TIME.test(h.usualTime) && !h.anytime) {
      const minutes = (typeof h.durationMinutes === 'number' && h.durationMinutes > 0 ? h.durationMinutes : 30)
      const [hh, mm] = h.usualTime.split(':').map(Number)
      const endTotal = Math.min(23 * 60 + 59, hh * 60 + mm + minutes)
      await saveRule(user.id, {
        kind: 'prefer',
        days: h.daysOfWeek ?? [],
        start: h.usualTime,
        end: `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`,
        activity: h.name.trim(),
        note: `Said during setup: usually ${h.name.trim()} around ${h.usualTime}.`,
      })
      created.rules++
    }
  }

  for (const b of body.busy ?? []) {
    if (!TIME.test(b.start ?? '') || !TIME.test(b.end ?? '')) continue
    await saveRule(user.id, {
      kind: 'busy',
      days: b.days ?? [],
      start: b.start,
      end: b.end,
      ...(b.note?.trim() ? { note: b.note.trim() } : {}),
    })
    created.rules++
  }

  return Response.json({ ok: true, created, hiddenTypes: [...off] })
}
