/**
 * Does this Canvas know when your classes actually meet?
 *
 * Everything about importing a timetable turns on one fact that no amount of
 * reading the docs settles: whether the teachers at *your* university put
 * their class meetings into the Canvas calendar. Canvas supports it; plenty
 * of institutions never use it and keep the timetable in a separate student
 * system instead. This asks, and prints what comes back.
 *
 *   npx tsx scripts/canvas-timetable-probe.ts
 *
 * It reads the Canvas address and token already stored for user 1 by the app
 * (the CanvasCredential node), so there is nothing to paste. It only ever
 * performs GETs, and writes nothing to the database.
 */
import { createClient } from '@libsql/client'
import 'dotenv/config'

const userId = 1
const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/lifep.db'
const authToken = process.env.TURSO_AUTH_TOKEN
const db = createClient({ url, ...(authToken ? { authToken } : {}) })

interface Props { baseUrl?: string; token?: string }

async function api(baseUrl: string, token: string, path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return { __status: res.status }
  return JSON.parse((await res.text()).replace(/^while\(1\);/, ''))
}

async function main() {
  const rows = await db.execute({
    sql: "select properties from nodes where user_id = ? and type = 'CanvasCredential' limit 1",
    args: [userId],
  })
  const props = (rows.rows[0]?.properties ? JSON.parse(String(rows.rows[0].properties)) : {}) as Props
  if (!props.baseUrl || !props.token) {
    console.log('No Canvas is connected. Connect it in Settings first.')
    return
  }
  const { baseUrl, token } = props
  console.log(`Canvas: ${baseUrl}\n`)

  const courses = (await api(baseUrl, token, '/courses?enrollment_state=active&per_page=50')) as
    | { id: number; name: string }[]
    | { __status: number }
  if (!Array.isArray(courses)) {
    console.log(`Could not list courses (HTTP ${courses.__status}).`)
    return
  }
  console.log(`${courses.length} active course(s).\n`)

  // A wide window, because a class that meets weekly shows up as one event
  // per week and the default window is a fortnight.
  const start = new Date()
  start.setMonth(start.getMonth() - 1)
  const end = new Date()
  end.setMonth(end.getMonth() + 4)

  let total = 0
  for (const course of courses) {
    const q = [
      'type=event',
      `context_codes[]=course_${course.id}`,
      `start_date=${start.toISOString().slice(0, 10)}`,
      `end_date=${end.toISOString().slice(0, 10)}`,
      'per_page=100',
    ].join('&')
    const events = (await api(baseUrl, token, `/calendar_events?${q}`)) as
      | { title?: string; start_at?: string; end_at?: string; location_name?: string }[]
      | { __status: number }

    if (!Array.isArray(events)) {
      console.log(`- ${course.name}: could not read (HTTP ${events.__status})`)
      continue
    }
    total += events.length
    console.log(`- ${course.name}: ${events.length} calendar event(s)`)
    for (const e of events.slice(0, 4)) {
      console.log(`    ${e.start_at ?? '?'} → ${e.end_at ?? '?'}  ${e.title ?? '(untitled)'}${e.location_name ? `  @ ${e.location_name}` : ''}`)
    }
    if (events.length > 4) console.log(`    …and ${events.length - 4} more`)
  }

  console.log(
    total > 0
      ? `\n${total} event(s) in total. Your class meetings can be imported and linked to their course.`
      : '\nNothing in any course calendar. Your university keeps the timetable somewhere other than Canvas, so class times have to be entered by hand — but they can still be attached to the right course.',
  )
}

main().catch((e) => { console.error(e); process.exit(1) })
