import { createEdge, createNode, deleteNode, findExistingEdge, getNodes, updateNode } from '@/lib/graph/queries'
import { localDateStr } from '@/lib/date'
import { moduleEnabled } from '@/lib/modules'
import { readSettings, writeSettings } from '@/lib/settings'
import type { Node } from '@/lib/db/schema'

/**
 * Canvas LMS, read into the school module.
 *
 * The user pastes the address of their institution's Canvas and a personal
 * access token once; from then on their courses, assignments, quizzes and
 * announcements are pulled in as ordinary nodes, so everything else — the
 * planner, Today, the graph, the assistant — treats coursework exactly like
 * coursework entered by hand.
 *
 * Two rules shape all of it:
 *
 *  1. Canvas owns the facts, the user owns their progress. A re-sync
 *     refreshes titles, due dates and points, and never touches `status` or
 *     `grade` in a way that walks a student's own bookkeeping backwards.
 *  2. Nothing is ever deleted. An assignment pulled from a course the user
 *     has since dropped stays in the graph — it may have notes and time
 *     blocks hanging off it, and a sync is not a delete.
 */

/**
 * The token lives in its own node type, not in Settings.
 *
 * Settings are exported by /api/export, read in a dozen places and described
 * to the assistant; a bearer token that can read (and, with a fuller scope,
 * write) someone's university account has no business travelling with them.
 * This type is excluded from the export, the graph, the assistant's reads and
 * the sweep — see PRIVATE_TYPES, HIDDEN_TYPES and BOOKKEEPING.
 */
export const CANVAS_CREDENTIAL_TYPE = 'CanvasCredential'

/** Anything the user should ever see about a Canvas failure is a CanvasError. */
export class CanvasError extends Error {
  /** The HTTP status behind it, when there was one. Lets a caller decide that
      a particular 404 is "this course has no quizzes" rather than a failure. */
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 15_000
/**
 * Ceilings, because this talks to the user's own university server. A student
 * with a decade of enrolments, or a course with a thousand announcements,
 * must not turn one click into a few hundred requests.
 */
const MAX_PAGES = 10
const MAX_COURSES = 30
const PER_PAGE = 100
/** How far back announcements are worth pulling. Canvas requires a window. */
const ANNOUNCEMENT_DAYS = 90
/** Canvas caps context_codes per request; well under it and batched. */
const CONTEXT_CODE_CHUNK = 10

export interface CanvasSyncSummary {
  ranAt: string
  courses: number
  assignments: number
  exams: number
  announcements: number
  created: number
  updated: number
}

export interface CanvasCredential {
  nodeId: number
  baseUrl: string
  token: string
  canvasUserName: string | null
  lastSummary: CanvasSyncSummary | null
}

/* ── talking to Canvas ─────────────────────────────────────────── */

/**
 * "myschool.instructure.com", "https://myschool.instructure.com/courses/12"
 * and a stray trailing slash all mean the same Canvas. Only the origin is
 * kept, since every request is built from `/api/v1` upwards.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new CanvasError('Enter the address of your Canvas, e.g. myschool.instructure.com')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new CanvasError(`"${raw.trim()}" does not look like a web address.`)
  }
  if (!url.hostname.includes('.')) throw new CanvasError(`"${raw.trim()}" does not look like a web address.`)
  return `${url.protocol}//${url.host}`
}

type Params = [string, string][]

function nextPageUrl(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part)
    if (match) return match[1]
  }
  return null
}

async function request(url: string, token: string): Promise<{ body: unknown; link: string | null }> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    // Wrong host, no DNS, no network, timeout — all the same thing to the
    // person reading it, and the underlying message ("fetch failed") tells
    // them nothing.
    throw new CanvasError('Could not reach that Canvas. Check the address, and that you are online.')
  }

  const host = new URL(url).host
  if (res.status === 401 || res.status === 403) {
    throw new CanvasError(`That token was rejected by ${host}. Generate a new access token in Canvas and paste it again.`, res.status)
  }
  if (res.status === 404) {
    /*
     * Two very different things arrive here.
     *
     * At the front door — /users/self, /courses — a 404 does mean there is
     * no Canvas API at this address. Inside a course it usually means that
     * course has the Assignments or Quizzes tab switched off, which is a
     * normal thing for a teacher to do and not an error at all. The caller
     * decides which it is; all this can do is say what was actually asked
     * for, rather than assert the address is wrong when the same token just
     * worked twice.
     */
    throw new CanvasError(`${host} has nothing at ${new URL(url).pathname}.`, 404)
  }
  if (res.status === 429 || res.status === 503) {
    throw new CanvasError(`${host} is asking us to slow down. Try again in a few minutes.`, res.status)
  }
  if (!res.ok) throw new CanvasError(`${host} answered with an error (${res.status}). Try again in a moment.`, res.status)

  const text = await res.text()
  try {
    // Canvas defends some endpoints against JSON hijacking by prefixing the
    // body with `while(1);`, which is not valid JSON.
    return { body: JSON.parse(text.replace(/^while\(1\);/, '')), link: res.headers.get('Link') }
  } catch {
    throw new CanvasError(`${host} answered, but not like a Canvas site. Check the address.`)
  }
}

function apiUrl(baseUrl: string, path: string, params: Params): string {
  const url = new URL(`${baseUrl}/api/v1${path}`)
  for (const [k, v] of params) url.searchParams.append(k, v)
  return url.toString()
}

async function getOne<T>(baseUrl: string, token: string, path: string, params: Params = []): Promise<T> {
  return (await request(apiUrl(baseUrl, path, params), token)).body as T
}

/** Every page of a list endpoint, following `Link: rel="next"`, up to MAX_PAGES. */
async function getAll<T>(baseUrl: string, token: string, path: string, params: Params = []): Promise<T[]> {
  let url: string | null = apiUrl(baseUrl, path, [...params, ['per_page', String(PER_PAGE)]])
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const { body, link }: { body: unknown; link: string | null } = await request(url, token)
    if (!Array.isArray(body)) break
    out.push(...(body as T[]))
    url = nextPageUrl(link)
  }
  return out
}

/**
 * The same list, but a 404 means "not here" rather than "it broke".
 *
 * A course with the Assignments tab turned off answers 404 for its
 * assignments, and a whole sync used to die on it — one teacher's setting
 * cost the user every other course in the term, under a message telling them
 * their Canvas address was wrong, seconds after the same address had
 * accepted their token.
 */
async function getAllIfPresent<T>(baseUrl: string, token: string, path: string, params: Params = []): Promise<T[]> {
  try {
    return await getAll<T>(baseUrl, token, path, params)
  } catch (e) {
    if (e instanceof CanvasError && e.status === 404) return []
    throw e
  }
}

export interface CanvasIdentity {
  id: number
  name: string
}

/**
 * Proves the token works and tells us whose it is.
 *
 * This is the one call where a 404 really does mean "there is no Canvas
 * here": /users/self exists on every Canvas that exists at all.
 */
export async function validateToken(baseUrl: string, token: string): Promise<CanvasIdentity> {
  const self = await getOne<{ id?: number; name?: string; short_name?: string }>(baseUrl, token, '/users/self')
    .catch((e: unknown) => {
      if (e instanceof CanvasError && e.status === 404) {
        throw new CanvasError(
          `${new URL(baseUrl).host} answered, but there is no Canvas API there. Use the address you sign in at.`,
          404,
        )
      }
      throw e
    })
  if (!self || typeof self.id !== 'number') {
    throw new CanvasError('That address answered, but not like a Canvas site. Check the address.')
  }
  return { id: self.id, name: self.name ?? self.short_name ?? 'your Canvas account' }
}

/* ── the credential node ───────────────────────────────────────── */

export async function readCredential(userId: number): Promise<CanvasCredential | null> {
  const node = (await getNodes(userId, { type: CANVAS_CREDENTIAL_TYPE }))[0]
  if (!node) return null
  const p = node.properties as Record<string, unknown>
  if (typeof p.baseUrl !== 'string' || typeof p.token !== 'string') return null
  return {
    nodeId: node.id,
    baseUrl: p.baseUrl,
    token: p.token,
    canvasUserName: typeof p.canvasUserName === 'string' ? p.canvasUserName : null,
    lastSummary: (p.lastSummary as CanvasSyncSummary | undefined) ?? null,
  }
}

export async function writeCredential(
  userId: number,
  props: { baseUrl: string; token: string; canvasUserId: number; canvasUserName: string },
): Promise<void> {
  const existing = (await getNodes(userId, { type: CANVAS_CREDENTIAL_TYPE }))[0]
  // Reconnecting replaces the token outright rather than merging: an old
  // token that no longer works is not worth keeping a copy of.
  const next = { ...props, connectedAt: new Date().toISOString(), lastSummary: null }
  if (existing) await updateNode(userId, existing.id, next)
  else await createNode(userId, CANVAS_CREDENTIAL_TYPE, next)
}

/** Removes every stored credential — plural, in case an old one was orphaned. */
export async function clearCredential(userId: number): Promise<void> {
  for (const node of await getNodes(userId, { type: CANVAS_CREDENTIAL_TYPE })) {
    await deleteNode(userId, node.id)
  }
}

/* ── mapping Canvas into nodes ─────────────────────────────────── */

interface CanvasCourse {
  id: number
  name?: string
  course_code?: string
  term?: { name?: string }
}

interface CanvasAssignment {
  id: number
  name?: string
  due_at?: string | null
  points_possible?: number | null
  html_url?: string
  description?: string | null
  quiz_id?: number | null
  submission?: { workflow_state?: string; submitted_at?: string | null; score?: number | null } | null
}

interface CanvasQuiz {
  id: number
  title?: string
  quiz_type?: string
  due_at?: string | null
  points_possible?: number | null
  html_url?: string
  description?: string | null
}

interface CanvasAnnouncement {
  id: number
  title?: string
  message?: string | null
  html_url?: string
  posted_at?: string | null
  context_code?: string
}

/**
 * A Canvas timestamp as the local calendar day, which is what every dated
 * node in this app stores. `due_at` is UTC, so slicing the ISO string would
 * put an 01:00 deadline on the wrong day for anyone east of Greenwich.
 */
function localDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : localDateStr(d)
}

function localTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Canvas descriptions are HTML. Nothing here renders HTML, so it is flattened. */
function plainText(html: string | null | undefined, limit: number): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return undefined
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/**
 * A quiz that is really a sit-down exam.
 *
 * Canvas has no field for this: `quiz_type` distinguishes a graded quiz
 * ('assignment') from practice and surveys, but a midterm and a weekly
 * multiple-choice quiz are both 'assignment'. The title is the only signal
 * there is, and getting it wrong is cheap in one direction (an exam listed
 * as an assignment is still on the right day) and merely untidy in the
 * other, so it is kept deliberately narrow.
 */
const EXAM_TITLE = /\b(exam|midterm|mid-term|final|finals)\b/i

/** todo → submitted → graded. A sync may move a student forwards, never back. */
const STATUS_RANK: Record<string, number> = { todo: 0, submitted: 1, graded: 2 }

function statusFromSubmission(sub: CanvasAssignment['submission']): string {
  if (!sub) return 'todo'
  if (sub.workflow_state === 'graded' && sub.score !== null && sub.score !== undefined) return 'graded'
  if (sub.submitted_at) return 'submitted'
  return 'todo'
}

type Props = Record<string, unknown>

/** Every synced node is found again by this pair, whatever its name becomes. */
const key = (canvasType: string, canvasId: number | string) => `${canvasType}:${canvasId}`

function canvasKey(node: Node): string | null {
  const p = node.properties as Props
  if (p.canvasId === undefined || p.canvasId === null || typeof p.canvasType !== 'string') return null
  return key(p.canvasType, String(p.canvasId))
}

class Writer {
  created = 0
  updated = 0
  private index = new Map<string, Node>()

  constructor(
    private userId: number,
    existing: Node[],
  ) {
    for (const node of existing) {
      const k = canvasKey(node)
      // First wins: if a duplicate ever slipped in, later syncs converge on
      // one of them rather than writing to both.
      if (k && !this.index.has(k)) this.index.set(k, node)
    }
  }

  /**
   * Create or refresh the node for one Canvas thing.
   *
   * `fresh` is what Canvas says now. Anything the user owns is carried over
   * from the stored copy by `keep`, so re-syncing is safe to do at any time
   * and as often as the user likes.
   */
  async upsert(type: string, k: string, fresh: Props, keep?: (prev: Props, next: Props) => void): Promise<number> {
    const existing = this.index.get(k)
    if (!existing) {
      const node = await createNode(this.userId, type, fresh)
      this.index.set(k, node)
      this.created++
      return node.id
    }
    const prev = existing.properties as Props
    // Merged over the stored properties, not replacing them: a user who added
    // notes, a priority or a link of their own keeps them.
    const next: Props = { ...prev, ...fresh }
    keep?.(prev, next)
    await updateNode(this.userId, existing.id, next)
    this.updated++
    return existing.id
  }
}

/** The course link the school hub reads: property first, edge alongside it. */
async function linkToCourse(userId: number, itemId: number, courseNodeId: number): Promise<void> {
  if (!(await findExistingEdge(userId, itemId, courseNodeId, 'part-of'))) {
    await createEdge(userId, itemId, courseNodeId, 'part-of')
  }
}

/* ── the sync ──────────────────────────────────────────────────── */

/**
 * Pull everything in, once. Safe to re-run: every node is matched on its
 * `canvasType`/`canvasId` pair and updated in place.
 *
 * Throws CanvasError with a message meant for the user; the caller stores it
 * in `settings.canvas.lastError`.
 */
export async function syncCanvas(userId: number): Promise<CanvasSyncSummary> {
  const settings = await readSettings(userId)
  if (!moduleEnabled(settings, 'school')) {
    throw new CanvasError('The School module is switched off, so there is nowhere to put your courses. Switch it on first.')
  }

  const cred = await readCredential(userId)
  if (!cred) throw new CanvasError('Canvas is not connected. Add your Canvas address and token first.')
  const { baseUrl, token } = cred

  const courses = (
    await getAll<CanvasCourse>(baseUrl, token, '/courses', [
      ['enrollment_state', 'active'],
      ['include[]', 'term'],
    ]).catch((e: unknown) => {
      // The course list is the other front door: if it is not there, the
      // address is wrong, whatever a stored token says.
      if (e instanceof CanvasError && e.status === 404) {
        throw new CanvasError(
          `${new URL(baseUrl).host} answered, but there is no Canvas API there. Check the address in Settings — it should be the one you sign in at.`,
          404,
        )
      }
      throw e
    })
  )
    // Canvas returns rows with no name for enrolments the token cannot read
    // (restricted by date, concluded); there is nothing to make a node from.
    .filter((c) => typeof c.id === 'number' && !!c.name)
    .slice(0, MAX_COURSES)

  const [courseNodes, assignmentNodes, examNodes, noteNodes] = await Promise.all([
    getNodes(userId, { type: 'Course' }),
    getNodes(userId, { type: 'Assignment' }),
    getNodes(userId, { type: 'Exam' }),
    getNodes(userId, { type: 'Note' }),
  ])
  // One writer over all four types: a quiz that was an Assignment last time
  // and reads as an Exam now must find its old node rather than fork.
  const writer = new Writer(userId, [...courseNodes, ...assignmentNodes, ...examNodes, ...noteNodes])

  const courseNodeIdByCanvasId = new Map<number, number>()
  let assignmentCount = 0
  let examCount = 0

  for (const course of courses) {
    const courseNodeId = await writer.upsert('Course', key('course', course.id), {
      name: course.name,
      code: course.course_code || undefined,
      semester: course.term?.name || undefined,
      canvasId: course.id,
      canvasType: 'course',
    })
    courseNodeIdByCanvasId.set(course.id, courseNodeId)

    const assignments = await getAllIfPresent<CanvasAssignment>(baseUrl, token, `/courses/${course.id}/assignments`, [
      ['include[]', 'submission'],
    ])
    /** Quizzes that already came through as assignments, so they are not synced twice. */
    const quizzesSeen = new Set<number>()

    for (const a of assignments) {
      if (typeof a.id !== 'number' || !a.name) continue
      if (typeof a.quiz_id === 'number') quizzesSeen.add(a.quiz_id)
      const fromCanvas = statusFromSubmission(a.submission)
      const itemId = await writer.upsert(
        'Assignment',
        key('assignment', a.id),
        {
          name: a.name,
          dueDate: localDate(a.due_at) ?? undefined,
          points: typeof a.points_possible === 'number' ? a.points_possible : undefined,
          url: a.html_url,
          description: plainText(a.description, 600),
          courseNodeId,
          status: fromCanvas,
          canvasId: a.id,
          canvasType: 'assignment',
        },
        (prev, next) => {
          // The student's own bookkeeping is the truth about their progress.
          // Canvas may move them forward (they submitted in the browser), but
          // it can never move them back: something ticked off here stays off.
          const mine = typeof prev.status === 'string' ? prev.status : 'todo'
          const theirs = typeof next.status === 'string' ? next.status : 'todo'
          next.status = (STATUS_RANK[theirs] ?? 0) > (STATUS_RANK[mine] ?? 0) ? theirs : mine
          if (prev.grade !== undefined) next.grade = prev.grade
        },
      )
      await linkToCourse(userId, itemId, courseNodeId)
      assignmentCount++
    }

    const quizzes = await getAllIfPresent<CanvasQuiz>(baseUrl, token, `/courses/${course.id}/quizzes`)
    for (const q of quizzes) {
      if (typeof q.id !== 'number' || !q.title || quizzesSeen.has(q.id)) continue
      // Practice quizzes and surveys are not work owed by a date, so they are
      // not brought in at all — a Today list full of ungraded practice is
      // worse than one without it.
      if (q.quiz_type && q.quiz_type !== 'assignment' && q.quiz_type !== 'graded_survey') continue
      const due = localDate(q.due_at)
      if (!due) continue

      const isExam = EXAM_TITLE.test(q.title)
      const itemId = await writer.upsert(
        isExam ? 'Exam' : 'Assignment',
        key('quiz', q.id),
        isExam
          ? {
              name: q.title,
              date: due,
              time: localTime(q.due_at) ?? undefined,
              points: typeof q.points_possible === 'number' ? q.points_possible : undefined,
              url: q.html_url,
              description: plainText(q.description, 600),
              courseNodeId,
              status: 'upcoming',
              canvasId: q.id,
              canvasType: 'quiz',
            }
          : {
              name: q.title,
              dueDate: due,
              points: typeof q.points_possible === 'number' ? q.points_possible : undefined,
              url: q.html_url,
              description: plainText(q.description, 600),
              courseNodeId,
              status: 'todo',
              canvasId: q.id,
              canvasType: 'quiz',
            },
        (prev, next) => {
          // Canvas says nothing about whether a quiz has been sat, so whatever
          // the student last said stands.
          if (typeof prev.status === 'string') next.status = prev.status
          if (prev.grade !== undefined) next.grade = prev.grade
        },
      )
      await linkToCourse(userId, itemId, courseNodeId)
      if (isExam) examCount++
      else assignmentCount++
    }
  }

  const announcements = await fetchAnnouncements(baseUrl, token, [...courseNodeIdByCanvasId.keys()])
  let announcementCount = 0
  for (const a of announcements) {
    if (typeof a.id !== 'number' || !a.title) continue
    const canvasCourseId = Number(a.context_code?.replace('course_', ''))
    const courseNodeId = courseNodeIdByCanvasId.get(canvasCourseId)
    if (!courseNodeId) continue

    const noteId = await writer.upsert('Note', key('announcement', a.id), {
      title: a.title,
      content: plainText(a.message, 2000) ?? '',
      url: a.html_url,
      postedAt: a.posted_at ?? undefined,
      canvasId: a.id,
      canvasType: 'announcement',
    })
    // 'about' rather than 'part-of': an announcement is not a piece of the
    // course the way an assignment is, it is something said about it.
    if (!(await findExistingEdge(userId, noteId, courseNodeId, 'about'))) {
      await createEdge(userId, noteId, courseNodeId, 'about')
    }
    announcementCount++
  }

  return {
    ranAt: new Date().toISOString(),
    courses: courses.length,
    assignments: assignmentCount,
    exams: examCount,
    announcements: announcementCount,
    created: writer.created,
    updated: writer.updated,
  }
}

/**
 * Announcements for several courses at once.
 *
 * The per-course endpoint would be one request per course; this one takes a
 * list of context codes, so a full timetable costs two or three requests.
 * Canvas requires a date window and defaults it to a fortnight, which is too
 * short to be useful on a first sync.
 */
async function fetchAnnouncements(baseUrl: string, token: string, courseIds: number[]): Promise<CanvasAnnouncement[]> {
  const start = new Date()
  start.setDate(start.getDate() - ANNOUNCEMENT_DAYS)
  const end = new Date()
  end.setDate(end.getDate() + 1)

  const out: CanvasAnnouncement[] = []
  for (let i = 0; i < courseIds.length; i += CONTEXT_CODE_CHUNK) {
    const chunk = courseIds.slice(i, i + CONTEXT_CODE_CHUNK)
    const params: Params = chunk.map((id) => ['context_codes[]', `course_${id}`])
    params.push(['start_date', start.toISOString()], ['end_date', end.toISOString()], ['active_only', 'true'])
    out.push(...(await getAllIfPresent<CanvasAnnouncement>(baseUrl, token, '/announcements', params)))
  }
  return out
}

/* ── settings bookkeeping ──────────────────────────────────────── */

/** The one place `settings.canvas` is written, so its four fields stay consistent. */
export async function recordCanvasState(
  userId: number,
  patch: Partial<{ enabled: boolean; baseUrl: string | null; lastSync: string | null; lastError: string | null }>,
): Promise<void> {
  const settings = await readSettings(userId)
  await writeSettings(userId, { canvas: { ...settings.canvas, ...patch } })
}

/** A message fit to show the user, whatever went wrong. */
export function canvasErrorMessage(e: unknown): string {
  if (e instanceof CanvasError) return e.message
  return 'Something went wrong talking to Canvas. Try again in a moment.'
}

/**
 * The last sync's counts, kept on the credential node rather than in Settings.
 *
 * `settings.canvas` has room for a timestamp and an error and no more, and
 * widening it would mean editing a file several other things read.
 */
export async function recordSyncSummary(userId: number, summary: CanvasSyncSummary): Promise<void> {
  const node = (await getNodes(userId, { type: CANVAS_CREDENTIAL_TYPE }))[0]
  if (!node) return
  await updateNode(userId, node.id, { ...(node.properties as Record<string, unknown>), lastSummary: summary })
}
