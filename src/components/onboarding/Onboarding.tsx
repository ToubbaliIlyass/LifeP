'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Plus, Check, ArrowRight, ArrowLeft, Clapperboard, GraduationCap, HeartPulse,
  NotebookPen, Sparkles, CalendarClock, Repeat, Target, PenLine, Plug, Copy, KeyRound,
  ExternalLink, Link2, AlertCircle, Loader2, Sun, Moon, Palette,
} from 'lucide-react'
import { ActureMark } from '@/components/ui/acture-mark'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { MicButton } from '@/components/ui/mic-button'
import { DictateBlock } from './DictateBlock'
import { OnboardingGraph, type GraphSeed, type SeedNode } from './OnboardingGraph'
import { MODULES } from '@/lib/modules'
import { ThemeToggle } from '@/components/ThemeToggle'
import { THEMES, applyTheme, storedTheme } from '@/lib/themes'
import { useMode } from '@/lib/useMode'
import { DEFAULT_DAY } from '@/lib/schedule'
import type { DayPart } from '@/lib/settings'
import { daysLabel, DAY_LABELS, DAY_NAMES, DAY_ORDER } from '@/lib/days'
import './onboarding.css'

/**
 * The setup interview.
 *
 * Forms, not a conversation, for everything with a shape: the answer is *for*
 * a specific field — a module switch, a working hour, a recurring Event, a
 * habit's usual time — and a chat that has to parse "mondays 2-4pm" into three
 * fields gets it wrong often enough to matter. The last question is free text
 * precisely because the rest of a life has no shape, and that one goes to the
 * model — as a proposal to approve, never as rows written behind the user's
 * back.
 *
 * Why it is asked at all: the app used to open on an empty graph with a
 * scheduler that had never seen this person — no goals, no fixed commitments,
 * no idea when they are busy — so its first fortnight of plans were guesses.
 * Three minutes of answers is cheaper than two weeks of being wrong.
 *
 * Two things soften the forms. Every step that collects a list can be
 * spoken instead (./DictateBlock.tsx): the transcript goes to a small
 * per-step schema and comes back as rows in these same fields, because
 * "class Monday and Wednesday two till four, work Thursday evenings" is one
 * breath and eleven values, and typing that out is the part people abandon.
 * And the other half of the screen draws the graph the answers are becoming
 * (./OnboardingGraph.tsx), so nobody has to take on faith what a form is
 * doing with what they said.
 *
 * Every step can be skipped, and everything here is editable later in
 * Settings. Nobody should have to fill in a form to look around.
 */

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  content: Clapperboard,
  school: GraduationCap,
  health: HeartPulse,
  journal: NotebookPen,
}

/** A day most people would recognise, offered rather than imposed. */
const SUGGESTED_PARTS: Omit<DayPart, 'id'>[] = [
  { name: 'Morning', start: '07:00', end: '09:00' },
  { name: 'Deep work', start: '09:00', end: '13:00' },
  { name: 'Afternoon', start: '13:00', end: '17:00' },
  { name: 'Evening', start: '17:00', end: '21:00' },
  { name: 'Wind down', start: '21:00', end: '23:00' },
]

interface Commitment {
  name: string
  daysOfWeek: number[]
  time: string
  duration: number
  /** Set when the row came from a Canvas course, so the Event is linked to it. */
  courseNodeId?: number
}
interface HabitDraft { name: string; durationMinutes: number; anytime: boolean; usualTime: string; goalId?: string }
interface BusyRule { days: number[]; start: string; end: string; note: string }

/*
 * Steps are keyed rather than numbered because not everyone gets the same
 * ones: connecting Canvas is meaningless to someone who turned school off on
 * the first screen, and a step that only says "skip me" is worse than a step
 * that never appears.
 */
const ALL_STEPS = [
  { id: 'look', title: 'How it looks', hint: 'Pick a palette. This one is just for you.', Icon: Palette },
  { id: 'modules', title: 'What you use', hint: 'Turn off anything that is not your life.', Icon: Sparkles },
  { id: 'canvas', title: 'Your school', hint: 'Optional — let Canvas fill this in for you.', Icon: GraduationCap },
  { id: 'day', title: 'Your day', hint: 'The hours you have, and what they are for.', Icon: CalendarClock },
  { id: 'week', title: 'Fixed in your week', hint: 'Whatever nothing may be planned over.', Icon: Repeat },
  { id: 'habits', title: 'Habits', hint: 'What you do regularly, and roughly when.', Icon: Repeat },
  { id: 'goals', title: 'Working towards', hint: 'The goals everything else serves.', Icon: Target },
  { id: 'notes', title: 'Anything else', hint: 'In your own words.', Icon: PenLine },
  { id: 'chatbot', title: 'Your chatbot', hint: 'Optional — use Acture from Claude or ChatGPT.', Icon: Plug },
] as const

/** The node types each step is about, so its branch lights while answered. */
const FOCUS: Record<string, readonly string[] | undefined> = {
  canvas: ['course', 'assignment'],
  week: ['event'],
  habits: ['habit'],
  goals: ['goal', 'project'],
  notes: ['task', 'note'],
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)

  const [modules, setModules] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULES.map((m) => [m.id, m.id !== 'content'])),
  )
  /*
   * The palette, first, because it is the one question with no wrong answer
   * and it changes the screen the moment it is pressed — a setup interview
   * that opens by doing something visible for you reads very differently
   * from one that opens by asking you to fill a form in. Applied and saved
   * on the press, so it survives Skip setup as well as Finish.
   */
  const mode = useMode()
  const [theme, setThemeState] = useState(() => (typeof document === 'undefined' ? 'default' : storedTheme()))
  const chooseTheme = useCallback((id: string) => {
    applyTheme(id)
    setThemeState(id)
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: id }),
    }).catch(() => { /* it is already applied and remembered on this device */ })
  }, [])

  const [hours, setHours] = useState<{ start: string; end: string }>({ start: DEFAULT_DAY.start, end: DEFAULT_DAY.end })
  const [dayParts, setDayParts] = useState<DayPart[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [busy, setBusy] = useState<BusyRule[]>([])
  const [habits, setHabits] = useState<HabitDraft[]>([])
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([{ id: uid(), name: '' }])
  const [projects, setProjects] = useState<{ id: string; name: string; goalId?: string }[]>([])
  const [notes, setNotes] = useState('')
  /*
   * The free-text step takes dictation straight into the box — there is
   * nothing to parse it into, the whole step is already plain words. What was
   * typed before a take begins is held in `keptNotes` and put back in front
   * of what is said, so speaking a second thought after fixing a word by hand
   * does not wipe the fix.
   */
  const [keptNotes, setKeptNotes] = useState('')
  const notesRef = useRef('')
  useEffect(() => { notesRef.current = notes }, [notes])
  const notesSpeech = useSpeechInput(useCallback(
    (spoken: string) => setNotes(keptNotes ? `${keptNotes}\n${spoken}` : spoken),
    [keptNotes],
  ))
  const { listening: notesListening, reset: resetNotes } = notesSpeech
  useEffect(() => {
    if (!notesListening) return
    setKeptNotes(notesRef.current.trim())
    resetNotes()
  }, [notesListening, resetNotes])

  /*
   * Canvas. The token is typed here and posted straight to the server, which
   * validates it against the user's own Canvas before storing it — a token
   * that is wrong should be rejected while the person who typed it is still
   * looking at the screen, not on some later sync they never see.
   */
  const [canvasUrl, setCanvasUrl] = useState('')
  const [canvasToken, setCanvasToken] = useState('')
  const [canvasState, setCanvasState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [canvasNote, setCanvasNote] = useState<string | null>(null)
  /*
   * The courses Canvas brought in, by node id.
   *
   * They arrive as rows in "Fixed in your week" with no time on them, which
   * is the one thing Canvas cannot tell us: most universities keep the
   * timetable in a student system Canvas never sees, so the meeting times
   * are not in the API at any address. What Canvas does give is the exact
   * name and the node to hang the Event off — so the half that is tedious
   * and easy to get wrong by hand is filled in, and all that is left is
   * saying when each one meets. A row with no time is never saved.
   */
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([])
  /* What the sync pulled in, by name, so the graph shows the work as well. */
  const [canvasNodes, setCanvasNodes] = useState<SeedNode[]>([])

  type SchoolCourse = { id: number; name: string; assignments?: { name: string }[] }

  const applyCourses = useCallback((list: SchoolCourse[]) => {
    setCourses(list.map((c) => ({ id: c.id, name: c.name })))
    setCanvasNodes([
      ...list.map((c) => ({ type: 'course', label: c.name })),
      ...list.flatMap((c) => (c.assignments ?? []).map((a) => ({ type: 'assignment', label: a.name }))),
    ])
    // Offered, not imposed: a course already in the list is left exactly as
    // the user has edited it.
    setCommitments((prev) => [
      ...prev,
      ...list
        .filter((c) => !prev.some((x) => x.courseNodeId === c.id))
        .map((c) => ({ name: c.name, daysOfWeek: [], time: '', duration: 60, courseNodeId: c.id })),
    ])
  }, [])

  const loadCourses = useCallback(async () => {
    const school = (await fetch('/api/school')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { courses?: SchoolCourse[] } | null
    if (school?.courses?.length) applyCourses(school.courses)
  }, [applyCourses])

  // Canvas may have been connected on an earlier run, in which case the
  // courses are already there and no sync is going to announce them.
  useEffect(() => {
    if (!modules.school) return
    fetch('/api/school')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { courses?: SchoolCourse[] } | null) => { if (d?.courses?.length) applyCourses(d.courses) })
      .catch(() => {})
  }, [modules.school, applyCourses])
  /* What the model read out of the free-text step. A preview of the proposal
     Finish will make — these are never written from here. */
  const [extracted, setExtracted] = useState<SeedNode[]>([])

  async function connectCanvas() {
    if (!canvasUrl.trim() || !canvasToken.trim()) return
    setCanvasState('connecting')
    setCanvasNote(null)
    try {
      const res = await fetch('/api/canvas/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: canvasUrl.trim(), token: canvasToken.trim() }),
      })
      const d = (await res.json().catch(() => null)) as { canvasUserName?: string | null; error?: string } | null
      if (!res.ok) {
        setCanvasState('error')
        setCanvasNote(d?.error ?? 'Could not connect to that Canvas.')
        return
      }
      setCanvasState('connected')
      setCanvasNote(d?.canvasUserName ? `Connected as ${d.canvasUserName}. Pulling your courses in…` : 'Connected. Pulling your courses in…')
      // Cleared as soon as it is accepted: there is no reason for it to sit
      // in a form field for the rest of setup.
      setCanvasToken('')
      const sync = await fetch('/api/canvas/sync', { method: 'POST' })
      const sd = (await sync.json().catch(() => null)) as {
        summary?: { courses: number; assignments: number; exams: number; announcements: number }
        error?: string
      } | null
      if (sync.ok && sd?.summary) {
        const { courses, assignments, exams, announcements } = sd.summary
        setCanvasNote(
          [
            `${courses} course${courses === 1 ? '' : 's'}`,
            `${assignments} assignment${assignments === 1 ? '' : 's'}`,
            exams > 0 ? `${exams} exam${exams === 1 ? '' : 's'}` : null,
            `${announcements} announcement${announcements === 1 ? '' : 's'}`,
          ].filter(Boolean).join(', ') + ' brought in.',
        )
        // Read back by name: the summary is a set of counts, and the next
        // step is about to offer these courses as rows to put a time on.
        await loadCourses()
      } else if (sd?.error) {
        setCanvasNote(`Connected, but the first sync failed: ${sd.error}`)
      }
    } catch {
      setCanvasState('error')
      setCanvasNote('Could not reach that Canvas.')
    }
  }

  // The chatbot step: a token is only ever created if the user asks for one.
  const [token, setToken] = useState<string | null>(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  // Read once, lazily, rather than in an effect: this only ever renders in the
  // browser, and setting state on mount just to learn the origin costs a
  // second render of the whole wizard.
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))
  const mcpUrl = `${origin}/api/mcp`
  /**
   * Whether this Acture lives on a network only this person is on — their
   * own machine, or their home wifi. Either way a cloud client cannot reach
   * it, and that is the difference between "your token is wrong" and "this
   * was never going to work", which is worth saying out loud.
   */
  const isLocal = (() => {
    try {
      const host = new URL(origin).hostname
      return (
        host === 'localhost' || host === '::1' || host.endsWith('.local') ||
        /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      )
    } catch {
      return false
    }
  })()
  /*
   * The desktop config, in the shape that actually survives being run.
   *
   * The token goes in an environment variable and the argument carries no
   * space, because several clients — Cursor, Codex, Claude Desktop on
   * Windows — do not escape spaces inside `args` when they invoke npx, and
   * mangle the header into something the server rejects. A rejected header
   * is a 401, a 401 sends the client looking for OAuth, and the user is
   * told "connection closed" with nothing pointing at the token.
   * `--allow-http` is only added for an address that is not https, which is
   * every local one.
   */
  const desktopConfig = token
    ? JSON.stringify(
        {
          acture: {
            command: 'npx',
            args: [
              '-y',
              'mcp-remote',
              mcpUrl,
              ...(origin.startsWith('http://') ? ['--allow-http'] : []),
              '--header',
              'Authorization:${ACTURE_TOKEN}',
            ],
            env: { ACTURE_TOKEN: `Bearer ${token}` },
          },
        },
        null,
        2,
      )
    : ''
  const cliCommand = token
    ? `claude mcp add --transport http acture ${mcpUrl} --header "Authorization: Bearer ${token}"`
    : ''

  const copy = useCallback(async (text: string, which: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1600)
    } catch { /* a clipboard the browser will not give up is not worth an error */ }
  }, [])

  async function createToken() {
    setTokenBusy(true)
    try {
      const res = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My chatbot' }),
      })
      const d = (await res.json().catch(() => null)) as { token?: string } | null
      if (d?.token) setToken(d.token)
    } finally {
      setTokenBusy(false)
    }
  }

  /*
   * Skipping is a decision, and it has to be recorded as one.
   *
   * It used to call `onDone` and nothing else: the page set
   * `onboarding.completed` on its local copy of settings, then re-read
   * settings from the server — which had never been told — and the interview
   * reappeared on top of the app a moment later. From the outside the Skip
   * button simply did not work.
   *
   * Awaited before handing back, so the re-read that follows sees it.
   */
  const [skipping, setSkipping] = useState(false)
  async function skip() {
    if (skipping) return
    setSkipping(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding: { completed: true, completedAt: new Date().toISOString() } }),
      })
    } catch {
      // Let them out anyway: being trapped in setup by a failed request is
      // worse than being asked again on the next load.
    } finally {
      setSkipping(false)
      onDone()
    }
  }

  /** Everything answered so far, written in one request. */
  async function finish() {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modules,
          workingHours: hours,
          dayParts: dayParts.filter((p) => p.name.trim()),
          commitments: commitments.filter((c) => c.name.trim() && c.time).map((c) => ({ ...c, frequency: 'weekly' })),
          busy: busy.filter((b) => b.start && b.end),
          habits: habits.filter((h) => h.name.trim()).map((h) => ({ ...h, goal: goalIndex(h.goalId) })),
          goals: goals.filter((g) => g.name.trim()).map((g) => ({ name: g.name })),
          projects: projects.filter((p) => p.name.trim()).map((p) => ({ name: p.name, goal: goalIndex(p.goalId) })),
        }),
      })
      // Showing "done" over a failed save would close setup for good with
      // none of it written. Stay here so Finish can be pressed again.
      if (!res.ok) { alert('Could not save your setup — please try again.'); return }
      // Sent after the answers are safe: this one calls a model, and a slow or
      // failing extraction must not cost the user the form they filled in.
      if (notes.trim().length >= 10) {
        await fetch('/api/onboarding/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: notes }),
        }).catch(() => {})
      }
      setFinished(true)
    } finally {
      setSaving(false)
    }
  }

  // Canvas only makes sense to someone who kept the school module.
  const STEPS = useMemo(
    () => ALL_STEPS.filter((s) => s.id !== 'canvas' || modules.school === true),
    [modules.school],
  )

  const summary = useMemo(() => [
    [goals.filter((g) => g.name.trim()).length, 'goal'],
    [projects.filter((p) => p.name.trim()).length, 'project'],
    [commitments.filter((c) => c.name.trim() && c.time).length, 'commitment'],
    [habits.filter((h) => h.name.trim()).length, 'habit'],
    [dayParts.filter((p) => p.name.trim()).length, 'part of your day'],
  ].filter(([n]) => (n as number) > 0) as [number, string][], [goals, projects, commitments, habits, dayParts])

  /*
   * ── Spoken answers ──────────────────────────────────────
   *
   * Everything the model pulls out of a spoken answer lands here, and here
   * only: in the same state the form writes to, appended to whatever is
   * already there rather than replacing it, so dictating twice adds twice and
   * dictating over a typed row never eats it. Each returns how many rows it
   * added, which is what the dictation block reports back.
   *
   * Nothing is trusted enough to skip the form: every value below is now
   * sitting in a visible, editable field, which is the whole design. A
   * misheard "ten" for "two" is a wrong number the user is looking at.
   */

  const mergeDay = useCallback((draft: {
    workingHours: { start: string; end: string } | null
    dayParts: { name: string; start: string; end: string; days: number[] }[]
  }) => {
    if (draft.workingHours) setHours(draft.workingHours)
    const parts = draft.dayParts.filter((p) => p.name.trim())
    if (parts.length) {
      setDayParts((s) => [...s, ...parts.map((p) => ({
        ...p,
        id: `part-${uid()}`,
        days: p.days.length === 7 ? [] : p.days,
      }))])
    }
    return parts.length + (draft.workingHours ? 1 : 0)
  }, [])

  const mergeWeek = useCallback((draft: {
    commitments: { name: string; daysOfWeek: number[]; time: string; duration: number }[]
    busy: { note: string; days: number[]; start: string; end: string }[]
  }) => {
    const said = draft.commitments.filter((c) => c.name.trim())
    if (said.length) setCommitments((s) => [...s, ...said])
    if (draft.busy.length) {
      setBusy((s) => [...s, ...draft.busy.map((b) => ({ days: b.days, start: b.start, end: b.end, note: b.note }))])
    }
    return said.length + draft.busy.length
  }, [])

  const mergeHabits = useCallback((draft: {
    habits: { name: string; durationMinutes: number; anytime: boolean; usualTime: string | null }[]
  }) => {
    const said = draft.habits.filter((h) => h.name.trim())
    if (said.length) {
      setHabits((s) => [...s, ...said.map((h) => ({
        name: h.name,
        durationMinutes: h.durationMinutes,
        anytime: h.anytime,
        // The form always needs a time in the box, even for one it will
        // never use because the habit belongs to the whole day.
        usualTime: h.usualTime ?? '08:00',
      }))])
    }
    return said.length
  }, [])

  const mergeGoals = useCallback((draft: { goals: { name: string }[]; projects: { name: string }[] }) => {
    const saidGoals = draft.goals.filter((g) => g.name.trim())
    const saidProjects = draft.projects.filter((p) => p.name.trim())
    // The step opens with one empty goal row; filling it in from speech
    // should not leave a blank line above the answers.
    if (saidGoals.length) {
      setGoals((s) => [...s.filter((g) => g.name.trim()), ...saidGoals.map((g) => ({ id: uid(), name: g.name }))])
    }
    if (saidProjects.length) {
      setProjects((s) => [...s, ...saidProjects.map((p) => ({ id: uid(), name: p.name }))])
    }
    return saidGoals.length + saidProjects.length
  }, [])

  /*
   * The free-text step, read ahead of time.
   *
   * Finish sends this paragraph to /api/onboarding/extract, which makes a
   * proposal out of it. This asks the cheaper question — what is in here? —
   * so the graph can show the tasks and notes it is about to contain while
   * the person is still writing. Nothing is written either way; the proposal
   * is still what creates them, and still waits to be approved.
   */
  const [previewing, setPreviewing] = useState(false)
  const previewedRef = useRef('')

  const previewNotes = useCallback(async (text: string) => {
    const said = text.trim()
    if (said.length < 10 || previewedRef.current === said) return
    previewedRef.current = said
    setPreviewing(true)
    try {
      const res = await fetch('/api/onboarding/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'notes', text: said }),
      })
      const data = (await res.json().catch(() => null)) as {
        draft?: { goals: { name: string }[]; projects: { name: string }[]; tasks: { name: string }[]; notes: { title: string }[] }
      } | null
      if (!data?.draft) return
      const d = data.draft
      setExtracted([
        ...d.goals.map((g) => ({ type: 'goal', label: g.name })),
        ...d.projects.map((p) => ({ type: 'project', label: p.name })),
        ...d.tasks.map((t) => ({ type: 'task', label: t.name })),
        ...d.notes.map((n) => ({ type: 'note', label: n.title })),
      ])
    } catch {
      // The preview failing costs nothing: the paragraph still goes to
      // extract on Finish, which is where these actually come from.
    } finally {
      setPreviewing(false)
    }
  }, [])

  /**
   * What the graph beside the form is drawing.
   *
   * Everything this interview produces, in the type the app will store it
   * as — the forms' own answers, whatever Canvas brought in, and what the
   * model read out of the free-text step. One list, because the graph does
   * not care which screen a node was named on, and nor should the person
   * watching it fill up.
   */
  const seed = useMemo<GraphSeed>(() => {
    const nameOfGoal = (id?: string) => goals.find((g) => g.id === id)?.name.trim() ?? ''
    return ({
    nodes: [
      ...goals.map((g) => ({ type: 'goal', label: g.name })),
      ...projects.map((p) => ({ type: 'project', label: p.name })),
      ...commitments.map((c) => ({ type: 'event', label: c.name })),
      ...habits.map((h) => ({ type: 'habit', label: h.name })),
      ...canvasNodes,
      ...extracted,
    ],
    // Only the links setup can be sure of: something the user themselves
    // said is in service of a goal.
    links: [
      ...projects.filter((p) => p.name.trim() && p.goalId)
        .map((p) => ({ from: { type: 'project', label: p.name }, to: { type: 'goal', label: nameOfGoal(p.goalId) }, type: 'supports' })),
      ...habits.filter((h) => h.name.trim() && h.goalId)
        .map((h) => ({ from: { type: 'habit', label: h.name }, to: { type: 'goal', label: nameOfGoal(h.goalId) }, type: 'supports' })),
      // A class only joins its course once it has a time, because that is
      // when it becomes an Event at all.
      ...commitments.filter((c) => c.name.trim() && c.time && c.courseNodeId !== undefined)
        .map((c) => ({
          from: { type: 'event', label: c.name },
          // By id, not by name: renaming the row must not quietly detach it
          // from the course it is a meeting of.
          to: { type: 'course', label: courses.find((x) => x.id === c.courseNodeId)?.name ?? '' },
          type: 'part-of',
        })),
    ].filter((l) => l.to.label),
    dayParts: dayParts.filter((p) => p.name.trim()),
    busy: busy.filter((b) => b.start && b.end),
    workingHours: hours,
  })
  }, [goals, projects, commitments, habits, canvasNodes, courses, extracted, dayParts, busy, hours])

  /*
   * What a thing is in aid of.
   *
   * Setup used to produce goals, projects and habits that had never heard of
   * one another — a ring of unconnected dots, which is the one graph shape
   * this app exists to avoid. The moment somebody names the goal their
   * project serves is the moment that link is certain, so it is asked for
   * here and written as an edge, rather than left to a model to infer later
   * from two names that happen to sit near each other.
   *
   * Goals are referred to by their draft id and turned into positions in the
   * saved list at the last moment, so renaming or deleting a goal cannot
   * silently repoint a link at a different one.
   */
  const namedGoals = useMemo(() => goals.filter((g) => g.name.trim()), [goals])
  const goalIndex = useCallback(
    (id?: string) => {
      const i = namedGoals.findIndex((g) => g.id === id)
      return i >= 0 ? i : null
    },
    [namedGoals],
  )

  function GoalPicker({ value, onChange, label }: { value?: string; onChange: (id: string | undefined) => void; label: string }) {
    if (namedGoals.length === 0) return null
    return (
      <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/65">
        {label}
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="ob-select"
        >
          <option value="">nothing yet</option>
          {namedGoals.map((g) => (
            <option key={g.id} value={g.id}>{g.name.trim()}</option>
          ))}
        </select>
      </label>
    )
  }

  function DayPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
    return (
      <div className="flex items-center gap-1">
        {DAY_ORDER.map((d) => {
          const on = days.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={DAY_NAMES[d]}
              onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))}
              className="ob-day"
            >
              {DAY_LABELS[d]}
            </button>
          )
        })}
      </div>
    )
  }

  // ── The finished screen ──────────────────────────────────
  if (finished) {
    return (
      <div className="ob-root">
        <div className="ob-done">
          <div className="ob-step" style={{ maxWidth: 560 }}>
            <div className="flex justify-center mb-5">
              <span className="ob-done-mark"><Check className="w-7 h-7" /></span>
            </div>
            <h1 className="text-[26px] font-serif mb-2">You are set up</h1>
            <p className="text-[13px] text-muted-foreground/75 mb-6 max-w-[42ch] mx-auto">
              {summary.length > 0
                ? `Saved ${summary.map(([n, word]) => `${n} ${word}${n > 1 && !word.endsWith('day') ? 's' : ''}`).join(', ')}. `
                : ''}
              Press <span className="text-foreground">plan</span> on the calendar whenever you want the
              day laid out — and tell the assistant what you actually did, so it learns where your
              plans are wrong.
            </p>
            <button onClick={onDone} className="ob-btn ob-btn-primary">
              Open Acture <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const current = STEPS[Math.min(step, STEPS.length - 1)]
  const Current = current

  return (
    <div className="ob-root">
      <div className="ob-shell">
        {/* ── Rail ─────────────────────────────────────── */}
        <aside className="ob-rail">
          <div className="flex items-center gap-2.5 mb-7">
            <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center">
              <ActureMark className="w-[18px] h-[18px] text-foreground" />
            </div>
            <span className="text-[19px] font-bold tracking-tight">Acture</span>
          </div>
          <nav className="space-y-0.5">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                onClick={() => setStep(i)}
                data-state={i === step ? 'current' : i < step ? 'done' : 'todo'}
                className="ob-rail-item"
              >
                <span className="ob-pip">{i < step ? <Check className="w-3 h-3" /> : i + 1}</span>
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </nav>

          {/*
            * Moving forward lives here rather than over the questions.
            *
            * A bar pinned to the bottom of the middle column sat on top of
            * whatever was being filled in — the last field of a long step was
            * behind the Next button. The rail has room, it is already where
            * "where am I" is answered, and nothing scrolls underneath it.
            */}
          <div className="ob-rail-foot">
            {step < STEPS.length - 1 ? (
              <button onClick={() => {
                if (current.id === 'notes') void previewNotes(notes)
                setStep((s) => s + 1)
              }} className="ob-btn ob-btn-primary w-full justify-center">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={finish} disabled={saving} className="ob-btn ob-btn-primary w-full justify-center">
                {saving ? 'Setting up…' : 'Finish'} <Check className="w-4 h-4" />
              </button>
            )}
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="ob-btn w-full justify-center">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <div className="flex items-center gap-1">
              <button onClick={skip} disabled={skipping} className="ob-btn ob-btn-ghost flex-1 justify-center">
                {skipping ? 'Skipping…' : 'Skip setup'}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* ── Content ──────────────────────────────────── */}
        <main className="ob-main">
          <div className="md:hidden flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center">
              <ActureMark className="w-[18px] h-[18px] text-foreground" />
            </div>
            <span className="text-[19px] font-bold tracking-tight">Acture</span>
          </div>

          <div className="ob-progress mb-6" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>

          <div key={step} className="ob-step">
            <div className="flex items-start gap-3 mb-6">
              <span className="ob-card-icon" style={{ marginTop: 2 }}><Current.Icon className="w-[18px] h-[18px]" /></span>
              <div>
                <h1 className="text-[24px] font-serif leading-tight">{Current.title}</h1>
                <p className="text-[13px] text-muted-foreground/70 mt-1">{Current.hint}</p>
              </div>
            </div>

            {/* 0. The palette */}
            {current.id === 'look' && (
              <div className="ob-stagger">
                <p className="text-[13px] text-muted-foreground/75 mb-4">
                  Everything here follows whichever you pick — the calendar, the graph, the charts.
                  Change it as often as you like, here or in Settings.
                </p>

                <div className="flex gap-1.5 mb-4">
                  {([['Light', false], ['Dark', true]] as const).map(([label, wantDark]) => (
                    <button
                      key={label}
                      onClick={() => mode.set(wantDark ? 'dark' : 'light')}
                      aria-pressed={mode.dark === wantDark}
                      className="ob-btn"
                      style={mode.dark === wantDark
                        ? { borderColor: 'color-mix(in oklch, var(--primary) 50%, transparent)', color: 'var(--primary)' }
                        : undefined}
                    >
                      {wantDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEMES.map((t) => (
                    <button key={t.id} onClick={() => chooseTheme(t.id)} data-on={theme === t.id} className="ob-swatch">
                      {/* Primary, secondary, then the two grounds the palette
                          uses for light and dark. */}
                      <span className="ob-swatch-colors">
                        {t.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium">{t.name}</span>
                        {theme === t.id && <Check className="w-3 h-3 text-primary" />}
                      </span>
                      <span className="text-[11px] text-muted-foreground/55 leading-snug">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 1. Modules */}
            {current.id === 'modules' && (
              <div className="space-y-2 ob-stagger">
                <p className="text-[13px] text-muted-foreground/75 mb-1">
                  Anything off disappears completely — no tab, nothing on the calendar, and the
                  assistant is never told it exists. Nothing is deleted, so you can change your
                  mind whenever.
                </p>
                {MODULES.map((m) => {
                  const on = modules[m.id] === true
                  const Icon = MODULE_ICONS[m.id] ?? Sparkles
                  return (
                    <button key={m.id} onClick={() => setModules((s) => ({ ...s, [m.id]: !on }))} data-on={on} className="ob-card">
                      <span className="ob-card-icon"><Icon className="w-[18px] h-[18px]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-serif">{m.label}</span>
                        <span className="block text-[12.5px] text-muted-foreground/65 mt-0.5">{m.blurb}</span>
                      </span>
                      <span className="ob-switch" aria-hidden />
                    </button>
                  )
                })}

              </div>
            )}

            {/* Canvas */}
            {current.id === 'canvas' && (
              <div className="ob-stagger">
                <p className="text-[13px] text-muted-foreground/75 mb-4">
                  If your school runs on Canvas, connect it and your courses, assignments and
                  announcements come in by themselves — and stay up to date. Everything then works
                  like anything else here: plan it into your day, link it to a goal, ask the
                  assistant about it. You can skip this and do it later in Settings.
                </p>

                {/* The guide. Written out rather than linked, because the one
                    place this fails is someone not finding the token page. */}
                <ol className="ob-row space-y-2.5 mb-3 text-[12.5px] text-muted-foreground/80">
                  <li className="flex gap-2.5">
                    <span className="ob-pip shrink-0">1</span>
                    <span>
                      Open Canvas and go to <span className="text-foreground">Account → Settings</span>,
                      or add <code className="font-mono text-[11.5px]">/profile/settings</code> to your
                      Canvas address.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="ob-pip shrink-0">2</span>
                    <span>
                      Scroll to <span className="text-foreground">Approved Integrations</span> and press{' '}
                      <span className="text-foreground">+ New Access Token</span>.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="ob-pip shrink-0">3</span>
                    <span>
                      Give it a purpose (&ldquo;Acture&rdquo;), leave the expiry blank so it does not
                      quietly stop working, and press <span className="text-foreground">Generate</span>.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="ob-pip shrink-0">4</span>
                    <span>
                      Copy the token <span className="text-foreground">now</span> — Canvas shows it once —
                      and paste it below with your Canvas address.
                    </span>
                  </li>
                </ol>

                <div className="ob-row space-y-2.5">
                  <label className="block">
                    <span className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Your Canvas address</span>
                    <input
                      value={canvasUrl}
                      onChange={(e) => setCanvasUrl(e.target.value)}
                      placeholder="https://aui.instructure.com"
                      inputMode="url"
                      autoComplete="off"
                      className="ob-field font-mono text-[12.5px]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Access token</span>
                    <input
                      value={canvasToken}
                      onChange={(e) => setCanvasToken(e.target.value)}
                      type="password"
                      placeholder="1234~abcd…"
                      autoComplete="off"
                      className="ob-field font-mono text-[12.5px]"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={connectCanvas}
                      disabled={canvasState === 'connecting' || !canvasUrl.trim() || !canvasToken.trim()}
                      className="ob-btn ob-btn-primary"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {canvasState === 'connecting' ? 'Connecting…' : canvasState === 'connected' ? 'Reconnect' : 'Connect Canvas'}
                    </button>
                    {canvasUrl.trim() && (
                      <a
                        href={`${canvasUrl.trim().replace(/\/$/, '')}/profile/settings`}
                        target="_blank"
                        rel="noreferrer"
                        className="ob-btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open token page
                      </a>
                    )}
                  </div>
                  {canvasNote && (
                    <p className={`flex items-start gap-1.5 text-[12px] ${canvasState === 'error' ? 'text-destructive' : 'text-muted-foreground/75'}`}>
                      {canvasState === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> : <Check className="w-3.5 h-3.5 shrink-0 mt-[1px]" />}
                      {canvasNote}
                    </p>
                  )}
                </div>

                <p className="text-[11.5px] text-muted-foreground/55 mt-3">
                  The token is stored on your own instance and never leaves it except to talk to your
                  Canvas. Revoke it any time from the same Canvas page.
                </p>
              </div>
            )}

            {/* 2. The day */}
            {current.id === 'day' && (
              <div className="space-y-6 ob-stagger">
                <DictateBlock
                  section="day"
                  placeholder="I'm up around seven and done by eleven…"
                  examples="“I'm up at seven, mornings are for training and email, I do my real work from nine to one, and evenings after six are family.”"
                  onDraft={mergeDay}
                />
                <div>
                  <p className="text-[13px] text-muted-foreground/75 mb-3">
                    When are you awake and available at all? Nothing is ever planned outside this.
                  </p>
                  <div className="flex items-end gap-3">
                    <label className="block">
                      <span className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Day starts</span>
                      <input type="time" value={hours.start} onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))} className="ob-time" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Day ends</span>
                      <input type="time" value={hours.end} onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))} className="ob-time" />
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-[13.5px] font-serif mb-1">Parts of the day</p>
                  <p className="text-[12.5px] text-muted-foreground/65 mb-3">
                    Sixteen hours are not interchangeable. Name the stretches yours is made of, and
                    things get planned into the right one instead of wherever a gap happens to be.
                  </p>
                  {dayParts.length === 0 && (
                    <button
                      onClick={() => setDayParts(SUGGESTED_PARTS.map((p) => ({ ...p, id: `part-${uid()}` })))}
                      className="ob-btn ob-btn-dashed mb-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Start from a typical day
                    </button>
                  )}
                  <div className="space-y-2">
                    {dayParts.map((part, i) => (
                      <div key={part.id} className="ob-row space-y-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            value={part.name}
                            placeholder="Deep work"
                            aria-label="Name of this part of the day"
                            onChange={(e) => setDayParts((s) => s.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                            className="ob-field"
                          />
                          <input type="time" value={part.start} aria-label="Starts" onChange={(e) => setDayParts((s) => s.map((p, j) => (j === i ? { ...p, start: e.target.value } : p)))} className="ob-time" />
                          <input type="time" value={part.end} aria-label="Ends" onChange={(e) => setDayParts((s) => s.map((p, j) => (j === i ? { ...p, end: e.target.value } : p)))} className="ob-time" />
                          <button onClick={() => setDayParts((s) => s.filter((_, j) => j !== i))} aria-label={`Remove ${part.name || 'this part'}`} className="ob-icon-btn">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Untouched means every day. Two parts can share a
                            name and split the week between them. */}
                        <div className="flex flex-wrap items-center gap-2">
                          <DayPicker
                            days={part.days ?? []}
                            onChange={(d) => setDayParts((s) => s.map((p, j) => (j === i ? { ...p, days: d.length === 7 ? [] : d } : p)))}
                          />
                          <span className="text-[11px] font-mono text-muted-foreground/50">
                            {(part.days ?? []).length === 0 ? 'every day' : daysLabel(part.days ?? [])}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setDayParts((s) => [...s, { id: `part-${uid()}`, name: '', start: hours.start, end: hours.end }])}
                    className="ob-btn ob-btn-dashed mt-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add a part
                  </button>
                </div>
              </div>
            )}

            {/* 3. Commitments and busy time */}
            {current.id === 'week' && (
              <div className="space-y-6 ob-stagger">
                <DictateBlock
                  section="week"
                  placeholder="Class Monday and Wednesday two till four…"
                  examples="“I have class Monday and Wednesday from two to four, I work Thursday and Friday nine to five, and I train Saturday mornings at nine for an hour and a half.”"
                  onDraft={mergeWeek}
                />
                <div>
                  <p className="text-[13px] text-muted-foreground/75 mb-3">
                    Classes, shifts, training — anything with a name that happens at the same time
                    each week. These land on your calendar, and nothing is planned over them.
                    {courses.length > 0 && (
                      <> Your Canvas courses are already here — Canvas knows their names but not when
                      they meet, so give each one its days and time. Anything you leave without a time
                      is skipped, and the ones you fill in are linked to the course itself.</>
                    )}
                  </p>
                  <div className="space-y-2">
                    {commitments.map((c, i) => (
                      <div key={i} className="ob-row space-y-2.5" data-pending={c.courseNodeId !== undefined && !c.time}>
                        {c.courseNodeId !== undefined && (
                          <p className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/55">
                            <GraduationCap className="w-3 h-3 shrink-0" />
                            from Canvas{c.time ? '' : ' — say when it meets, or leave it and it is skipped'}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <input value={c.name} placeholder="CLE shift" aria-label="Name" onChange={(e) => setCommitments((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="ob-field" />
                          <button onClick={() => setCommitments((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ob-icon-btn"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <DayPicker days={c.daysOfWeek} onChange={(d) => setCommitments((s) => s.map((x, j) => (j === i ? { ...x, daysOfWeek: d } : x)))} />
                        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                          <input type="time" value={c.time} aria-label="Starts at" onChange={(e) => setCommitments((s) => s.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className="ob-time" />
                          for
                          <input type="number" min={5} step={5} value={c.duration} aria-label="Minutes" onChange={(e) => setCommitments((s) => s.map((x, j) => (j === i ? { ...x, duration: Number(e.target.value) } : x)))} className="ob-time w-20" />
                          min
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setCommitments((s) => [...s, { name: '', daysOfWeek: [], time: '09:00', duration: 60 }])} className="ob-btn ob-btn-dashed mt-2">
                    <Plus className="w-3.5 h-3.5" /> Add a commitment
                  </button>
                </div>

                <div>
                  <p className="text-[13.5px] font-serif mb-1">Hours you are simply not available</p>
                  <p className="text-[12.5px] text-muted-foreground/65 mb-3">
                    For stretches with no single name on them — a job, a commute, a block of classes.
                  </p>
                  <div className="space-y-2">
                    {busy.map((b, i) => (
                      <div key={i} className="ob-row space-y-2.5">
                        <div className="flex items-center gap-2">
                          <input value={b.note} placeholder="Work" aria-label="What" onChange={(e) => setBusy((s) => s.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="ob-field" />
                          <input type="time" value={b.start} aria-label="From" onChange={(e) => setBusy((s) => s.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="ob-time" />
                          <input type="time" value={b.end} aria-label="Until" onChange={(e) => setBusy((s) => s.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="ob-time" />
                          <button onClick={() => setBusy((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ob-icon-btn"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <DayPicker days={b.days} onChange={(d) => setBusy((s) => s.map((x, j) => (j === i ? { ...x, days: d } : x)))} />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setBusy((s) => [...s, { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', note: '' }])} className="ob-btn ob-btn-dashed mt-2">
                    <Plus className="w-3.5 h-3.5" /> Add busy hours
                  </button>
                </div>
              </div>
            )}

            {/* 4. Habits */}
            {current.id === 'habits' && (
              <div className="ob-stagger">
                <DictateBlock
                  section="habits"
                  placeholder="I run most mornings, read before bed…"
                  examples="“I run most mornings around six for about forty minutes, I read half an hour before bed, and I try to drink three litres of water at some point in the day.”"
                  onDraft={mergeHabits}
                />
                <p className="text-[13px] text-muted-foreground/75 mb-3">
                  Saying when you usually do one means the first plan puts it there, instead of
                  guessing for a fortnight. Some belong to the whole day rather than a time in
                  it — mark those &ldquo;any time&rdquo; and they stay off the calendar.
                </p>
                <div className="space-y-2">
                  {habits.map((h, i) => (
                    <div key={i} className="ob-row space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input value={h.name} placeholder="Workout" aria-label="Habit" onChange={(e) => setHabits((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="ob-field" />
                        <button onClick={() => setHabits((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ob-icon-btn"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                        takes
                        <input type="number" min={0} step={5} value={h.durationMinutes} aria-label="Minutes" onChange={(e) => setHabits((s) => s.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) } : x)))} className="ob-time w-20" />
                        min
                        {!h.anytime && (
                          <>
                            <span className="ml-1">usually at</span>
                            <input type="time" value={h.usualTime} aria-label="Usual time" onChange={(e) => setHabits((s) => s.map((x, j) => (j === i ? { ...x, usualTime: e.target.value } : x)))} className="ob-time" />
                          </>
                        )}
                        <button
                          onClick={() => setHabits((s) => s.map((x, j) => (j === i ? { ...x, anytime: !x.anytime } : x)))}
                          aria-pressed={h.anytime}
                          className="ob-btn"
                          style={h.anytime ? { borderColor: 'color-mix(in oklch, var(--primary) 50%, transparent)', color: 'var(--primary)' } : undefined}
                        >
                          any time of day
                        </button>
                      </div>
                      <GoalPicker
                        label="works towards"
                        value={h.goalId}
                        onChange={(id) => setHabits((s) => s.map((x, j) => (j === i ? { ...x, goalId: id } : x)))}
                      />
                    </div>
                  ))}
                </div>
                <button onClick={() => setHabits((s) => [...s, { name: '', durationMinutes: 30, anytime: false, usualTime: '08:00' }])} className="ob-btn ob-btn-dashed mt-2">
                  <Plus className="w-3.5 h-3.5" /> Add a habit
                </button>
              </div>
            )}

            {/* 5. Goals and projects */}
            {current.id === 'goals' && (
              <div className="space-y-6 ob-stagger">
                <DictateBlock
                  section="goals"
                  placeholder="I want to finish my degree, ship my app…"
                  examples="“I want to graduate this year and get properly fit. Right now I'm building Acture and writing my internship report.”"
                  onDraft={mergeGoals}
                />
                <div>
                  <p className="text-[13px] text-muted-foreground/75 mb-3">What are you working towards? A few words each is enough.</p>
                  <div className="space-y-2">
                    {goals.map((g, i) => (
                      <div key={g.id} className="flex items-center gap-2">
                        <input value={g.name} placeholder="Become financially independent" aria-label="Goal" onChange={(e) => setGoals((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="ob-field" />
                        <button onClick={() => setGoals((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ob-icon-btn"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setGoals((s) => [...s, { id: uid(), name: '' }])} className="ob-btn ob-btn-dashed mt-2">
                    <Plus className="w-3.5 h-3.5" /> Add a goal
                  </button>
                </div>

                <div>
                  <p className="text-[13.5px] font-serif mb-1">And anything bigger you are in the middle of</p>
                  <p className="text-[12.5px] text-muted-foreground/65 mb-3">A project, a job, a build — things tasks can belong to.</p>
                  <div className="space-y-2">
                    {projects.map((p, i) => (
                      <div key={p.id} className="ob-row space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={p.name} placeholder="Acture" aria-label="Project" onChange={(e) => setProjects((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="ob-field" />
                          <button onClick={() => setProjects((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="ob-icon-btn"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <GoalPicker
                          label="works towards"
                          value={p.goalId}
                          onChange={(id) => setProjects((s) => s.map((x, j) => (j === i ? { ...x, goalId: id } : x)))}
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setProjects((s) => [...s, { id: uid(), name: '' }])} className="ob-btn ob-btn-dashed mt-2">
                    <Plus className="w-3.5 h-3.5" /> Add a project
                  </button>
                </div>
              </div>
            )}

            {/* 6. Free text */}
            {current.id === 'notes' && (
              <div className="ob-stagger">
                <p className="text-[13px] text-muted-foreground/75 mb-3">
                  Deadlines coming up, what you are in the middle of, how you like to work. Write it
                  however you like.
                </p>
                <div className="ob-field-wrap">
                  <textarea
                    value={notesSpeech.listening && notesSpeech.mode === 'live'
                      ? [keptNotes, notesSpeech.transcript].filter(Boolean).join('\n')
                      : notes}
                    onChange={(e) => setNotes(e.target.value)}
                    readOnly={notesSpeech.listening}
                    rows={9}
                    placeholder={
                      notesSpeech.transcribing ? 'Writing that down…'
                        : notesSpeech.listening ? (notesSpeech.mode === 'record' ? 'Recording — press stop when you are done' : 'Listening…')
                        : "i'm finishing my degree this year, have an internship report due in three weeks, and i build side projects on weekends…"
                    }
                    className="ob-field ob-field-dictate font-serif resize-y"
                    style={{ lineHeight: 1.6 }}
                  />
                  <span className="ob-field-mic"><MicButton speech={notesSpeech} className="w-8 h-8" /></span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <button
                    onClick={() => previewNotes(notes)}
                    disabled={previewing || notes.trim().length < 10}
                    className="ob-btn"
                  >
                    {previewing
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    {previewing ? 'Reading it…' : 'Show what this becomes'}
                  </button>
                  <p className="text-[12.5px] text-muted-foreground/60">
                    This becomes a proposal you can look over — nothing is created until you approve it.
                  </p>
                </div>
                {notesSpeech.error && (
                  <p className="flex items-start gap-1.5 text-[12px] text-destructive mt-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> {notesSpeech.error}
                  </p>
                )}
              </div>
            )}

            {/* 7. MCP */}
            {current.id === 'chatbot' && (
              <div className="ob-stagger">
                <p className="text-[13px] text-muted-foreground/75 mb-4">
                  Acture can be used from the chatbot you already talk to. Claude, ChatGPT or Cursor
                  can then see your day, look things up, remember what they learn about you, and
                  suggest tasks — which still wait for your approval here. You can skip this and set
                  it up later in Settings.
                </p>

                <div className="ob-row space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground/50 mb-1.5">Server URL</p>
                    <div className="flex items-center gap-2">
                      <code className="ob-field font-mono text-[12px] break-all">{mcpUrl}</code>
                      <button onClick={() => copy(mcpUrl, 'url')} aria-label="Copy server URL" className="ob-btn">
                        {copied === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {!token ? (
                    <button onClick={createToken} disabled={tokenBusy} className="ob-btn">
                      <KeyRound className="w-3.5 h-3.5" /> {tokenBusy ? 'Creating…' : 'Create a token'}
                    </button>
                  ) : (
                    <div>
                      <p className="text-[12px] font-medium mb-1.5">Copy this now — it is not shown again.</p>
                      <div className="flex items-center gap-2 mb-2">
                        <code className="ob-field font-mono text-[12px] break-all">{token}</code>
                        <button onClick={() => copy(token, 'token')} aria-label="Copy token" className="ob-btn">
                          {copied === 'token' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <button onClick={() => copy(`${mcpUrl}?token=${token}`, 'both')} className="ob-btn">
                        {copied === 'both' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy URL with token
                      </button>
                      <p className="text-[11.5px] text-muted-foreground/60 mt-2">
                        For clients that take a single URL. Others ask for the URL and the token separately.
                      </p>

                      {/*
                        * The step used to stop at a URL and a token, which is
                        * everything the server needs and not enough for any
                        * client: the desktop apps want a config file with a
                        * bridge in it, and the web ones want an address that
                        * is not this laptop. Both failures look identical
                        * from the chatbot's side — "could not connect".
                        */}
                      <p className="text-[12px] font-medium mt-4 mb-1.5">Claude Desktop, Cursor</p>
                      <p className="text-[11.5px] text-muted-foreground/65 mb-2">
                        Settings → Developer → Edit Config, paste this inside{' '}
                        <code className="font-mono text-[11px]">mcpServers</code>, and restart. Needs Node
                        installed — <code className="font-mono text-[11px]">mcp-remote</code> is what bridges a
                        desktop app to a web address.
                      </p>
                      <button onClick={() => copy(desktopConfig, 'desktop')} className="ob-btn">
                        {copied === 'desktop' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy the Claude Desktop config
                      </button>

                      <p className="text-[12px] font-medium mt-4 mb-1.5">Claude Code</p>
                      <button onClick={() => copy(cliCommand, 'cli')} className="ob-btn">
                        {copied === 'cli' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy the terminal command
                      </button>

                      {isLocal && (
                        <p className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground/70 mt-4">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                          This address is on your own computer, so only apps running here can reach it —
                          Claude Desktop, Cursor, Claude Code. Claude.ai and ChatGPT connect from their own
                          servers and will say they cannot connect, whatever you paste; those need Acture
                          published at an address on the internet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Below 900px there is no rail to put any of this in, so the bar
              comes back — see .ob-footer, which hides itself above that. */}
          <div className="ob-footer">
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="ob-btn">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            <div className="flex-1" />
            <button onClick={skip} disabled={skipping} className="ob-btn ob-btn-ghost">
              {skipping ? 'Skipping…' : 'Skip setup'}
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => {
                  // Leaving the free-text step reads it, so the graph is
                  // showing everything by the time Finish is in reach. Not
                  // awaited: nobody should wait on a model to turn a page.
                  if (current.id === 'notes') void previewNotes(notes)
                  setStep((s) => s + 1)
                }}
                className="ob-btn ob-btn-primary"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={finish} disabled={saving} className="ob-btn ob-btn-primary">
                {saving ? 'Setting up…' : 'Finish'} <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </main>

        {/* The answers, as the graph they are about to become. Decoration in
            the sense that nothing depends on it, and not decoration at all in
            the sense that it is the app's own view of what is being said —
            which is why it is drawn from the same state the form writes to
            rather than from a mock. */}
        <OnboardingGraph seed={seed} focus={FOCUS[current.id]} />
      </div>
    </div>
  )
}
