'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, ChevronDown, FileText, GraduationCap, Pencil, Plus, X } from 'lucide-react'
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel'
import { notifyDataChanged } from '@/lib/dataSignal'
import { addDays, todayStr } from '@/lib/date'

interface Assignment {
  id: number
  name: string
  courseId: number | null
  dueDate: string | null
  status: 'todo' | 'submitted' | 'graded'
  grade: string | null
}

interface Exam {
  id: number
  name: string
  courseId: number | null
  date: string | null
  time: string | null
  location: string | null
  status: 'upcoming' | 'taken' | 'graded'
  grade: string | null
}

interface Course {
  id: number
  name: string
  code: string | null
  semester: string | null
  credits: number | null
  assignments: Assignment[]
  exams: Exam[]
}

interface SchoolData {
  courses: Course[]
  unassigned: { assignments: Assignment[]; exams: Exam[] }
}

const ASSIGNMENT_NEXT: Record<Assignment['status'], Assignment['status']> = {
  todo: 'submitted',
  submitted: 'graded',
  graded: 'todo',
}
const EXAM_NEXT: Record<Exam['status'], Exam['status']> = {
  upcoming: 'taken',
  taken: 'graded',
  graded: 'upcoming',
}

const STATUS_STYLE: Record<string, string> = {
  todo: 'bg-muted/60 text-muted-foreground/70',
  upcoming: 'bg-muted/60 text-muted-foreground/70',
  submitted: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  taken: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  graded: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

const input =
  'bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0'

type Urgency = 'overdue' | 'today' | 'soon' | 'later' | null

/** How pressing a date is, for something not yet finished. */
function urgencyOf(date: string | null, done: boolean): Urgency {
  if (!date || done) return null
  const today = todayStr()
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  if (date <= addDays(today, 7)) return 'soon'
  return 'later'
}

const URGENCY_TEXT: Record<Exclude<Urgency, null>, string> = {
  overdue: 'text-red-400/80',
  today: 'text-primary',
  soon: 'text-amber-400/80',
  later: 'text-muted-foreground/65',
}

/** The one shape the row renderer works in, whichever node type it came from. */
interface Item {
  kind: 'assignment' | 'exam'
  id: number
  name: string
  courseId: number | null
  date: string | null
  status: string
  grade: string | null
  meta: string[]
  done: boolean
}

function toItem(a: Assignment | Exam): Item {
  if ('dueDate' in a) {
    return {
      kind: 'assignment',
      id: a.id,
      name: a.name,
      courseId: a.courseId,
      date: a.dueDate,
      status: a.status,
      grade: a.grade,
      meta: [],
      done: a.status === 'graded',
    }
  }
  return {
    kind: 'exam',
    id: a.id,
    name: a.name,
    courseId: a.courseId,
    date: a.date,
    status: a.status,
    grade: a.grade,
    meta: [a.time, a.location ? `@ ${a.location}` : null].filter((x): x is string => !!x),
    done: a.status === 'taken' || a.status === 'graded',
  }
}

export function SchoolPanel({ refreshKey }: { refreshKey?: number } = {}) {
  const [data, setData] = useState<SchoolData>({ courses: [], unassigned: { assignments: [], exams: [] } })
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [composer, setComposer] = useState<null | 'course' | 'assignment' | 'exam'>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(() => {
    fetch('/api/school')
      .then((r) => r.json())
      .then((d: SchoolData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const courses = data.courses
  const unassigned = useMemo(
    () => [...data.unassigned.exams.map(toItem), ...data.unassigned.assignments.map(toItem)],
    [data.unassigned],
  )

  // Counted across every course so the header can say what is pressing without
  // the user having to expand anything.
  const { overdue, soon } = useMemo(() => {
    const all = [
      ...courses.flatMap((c) => [...c.exams.map(toItem), ...c.assignments.map(toItem)]),
      ...unassigned,
    ]
    return {
      overdue: all.filter((i) => urgencyOf(i.date, i.done) === 'overdue').length,
      soon: all.filter((i) => ['today', 'soon'].includes(urgencyOf(i.date, i.done) ?? '')).length,
    }
  }, [courses, unassigned])

  async function patch(body: Record<string, unknown>) {
    await fetch('/api/school', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    load()
    notifyDataChanged()
  }

  function advance(item: Item) {
    const next = item.kind === 'exam'
      ? EXAM_NEXT[item.status as Exam['status']]
      : ASSIGNMENT_NEXT[item.status as Assignment['status']]
    // Optimistic, like the content board: a status pill that waits on a round
    // trip reads as a click that did not register.
    setData((d) => mapItems(d, item.id, (p) => ({ ...p, status: next, grade: next === 'graded' ? p.grade : null })))
    return patch({ id: item.id, status: next })
  }

  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const empty = courses.length === 0 && unassigned.length === 0

  return (
    <div className="flex flex-col h-full">
      {selectedId !== null && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
          onMutated={() => { load(); notifyDataChanged(); setSelectedId(null) }}
        />
      )}

      <div className="shrink-0 border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">
            {courses.length} {courses.length === 1 ? 'course' : 'courses'}
          </p>
          {overdue > 0 && <span className="text-[10px] font-mono text-red-400/80">{overdue} overdue</span>}
          {soon > 0 && <span className="text-[10px] font-mono text-amber-400/80">{soon} due this week</span>}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setComposer(composer === 'course' ? null : 'course')}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40"
            >
              <BookOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Course</span>
            </button>
            <button
              onClick={() => setComposer(composer === 'exam' ? null : 'exam')}
              className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40"
            >
              <GraduationCap className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exam</span>
            </button>
            <button
              onClick={() => setComposer(composer === 'assignment' ? null : 'assignment')}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" /> Assignment
            </button>
          </div>
        </div>

        {composer === 'course' && (
          <CourseComposer onClose={() => setComposer(null)} onCreated={() => { setComposer(null); load(); notifyDataChanged() }} />
        )}
        {(composer === 'assignment' || composer === 'exam') && (
          <ItemComposer
            kind={composer}
            courses={courses}
            onClose={() => setComposer(null)}
            onCreated={() => { setComposer(null); load(); notifyDataChanged() }}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>}

        {!loading && empty && (
          <div className="pt-12 px-6 text-center">
            <p className="text-[13px] text-foreground/70">Nothing for school yet</p>
            <p className="text-[12px] text-muted-foreground/55 mt-1.5">
              Add a course, then hang its assignments and exams off it — or just tell the assistant.
            </p>
            <button
              onClick={() => setComposer('course')}
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" /> First course
            </button>
          </div>
        )}

        {!loading && !empty && (
          <div className="p-4 space-y-3">
            {courses.map((course) => {
              const items = [...course.exams.map(toItem), ...course.assignments.map(toItem)]
              const courseOverdue = items.filter((i) => urgencyOf(i.date, i.done) === 'overdue').length
              const open = !collapsed.has(course.id)
              return (
                <div key={course.id} className="border border-border/60 rounded-xl overflow-hidden">
                  <div className="flex items-stretch bg-muted/20">
                    <button
                      onClick={() => toggle(course.id)}
                      className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors min-w-0"
                    >
                      <div className="text-left min-w-0">
                        <p className="text-[13px] text-foreground/85 truncate">{course.name}</p>
                        <div className="flex gap-2 mt-0.5 flex-wrap">
                          {course.code && <span className="text-[10px] font-mono text-muted-foreground/65">{course.code}</span>}
                          {course.semester && <span className="text-[10px] font-mono text-muted-foreground/65">{course.semester}</span>}
                          {course.credits !== null && <span className="text-[10px] font-mono text-muted-foreground/65">{course.credits} cr</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {courseOverdue > 0 && (
                          <span className="text-[10px] font-mono text-red-400/80">{courseOverdue} overdue</span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground/65">
                          {course.assignments.length}A · {course.exams.length}E
                        </span>
                        <ChevronDown className={`w-3 h-3 text-muted-foreground/55 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    <button
                      onClick={() => setSelectedId(course.id)}
                      title="View / edit course"
                      className="px-3 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>

                  {open && (
                    <div className="p-2 space-y-1 border-t border-border/40">
                      {items.length === 0 && (
                        <p className="text-[11px] text-muted-foreground/45 text-center py-3">
                          No assignments or exams yet
                        </p>
                      )}
                      {items.map((item) => (
                        <ItemRow
                          key={`${item.kind}-${item.id}`}
                          item={item}
                          courses={courses}
                          onAdvance={() => advance(item)}
                          onGrade={(grade) => patch({ id: item.id, grade })}
                          onCourse={(courseId) => patch({ id: item.id, courseId })}
                          onOpen={() => setSelectedId(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {unassigned.length > 0 && (
              <div className="border border-dashed border-border/60 rounded-xl overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/20">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">No course</p>
                  <p className="text-[10px] text-muted-foreground/55 mt-0.5">Pick a course to file these away.</p>
                </div>
                <div className="p-2 space-y-1 border-t border-border/40">
                  {unassigned.map((item) => (
                    <ItemRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      courses={courses}
                      onAdvance={() => advance(item)}
                      onGrade={(grade) => patch({ id: item.id, grade })}
                      onCourse={(courseId) => patch({ id: item.id, courseId })}
                      onOpen={() => setSelectedId(item.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** Apply `fn` to whichever assignment or exam has `id`, wherever it sits. */
function mapItems(
  d: SchoolData,
  id: number,
  fn: (p: { status: string; grade: string | null }) => { status: string; grade: string | null },
): SchoolData {
  const patchOne = <T extends { id: number; status: string; grade: string | null }>(x: T): T =>
    x.id === id ? ({ ...x, ...fn(x) } as T) : x
  return {
    courses: d.courses.map((c) => ({
      ...c,
      assignments: c.assignments.map(patchOne),
      exams: c.exams.map(patchOne),
    })),
    unassigned: {
      assignments: d.unassigned.assignments.map(patchOne),
      exams: d.unassigned.exams.map(patchOne),
    },
  }
}

function ItemRow({
  item, courses, onAdvance, onGrade, onCourse, onOpen,
}: {
  item: Item
  courses: Course[]
  onAdvance: () => void
  onGrade: (grade: string) => void
  onCourse: (courseId: number | null) => void
  onOpen: () => void
}) {
  const urgency = urgencyOf(item.date, item.done)
  const next = item.kind === 'exam'
    ? EXAM_NEXT[item.status as Exam['status']]
    : ASSIGNMENT_NEXT[item.status as Assignment['status']]

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group">
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          item.done ? 'bg-emerald-400/60' : item.kind === 'exam' ? 'bg-rose-400' : 'bg-sky-400'
        }`}
        title={item.kind}
      />

      <div className="flex-1 min-w-0">
        <button onClick={onOpen} className="block w-full text-left">
          <p className={`text-[13px] truncate ${item.done ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
            {item.name}
          </p>
        </button>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {item.date && (
            <span className={`text-[10px] font-mono ${urgency ? URGENCY_TEXT[urgency] : 'text-muted-foreground/65'}`}>
              {urgency === 'overdue' ? 'overdue · ' : urgency === 'today' ? 'today · ' : item.kind === 'assignment' ? 'due ' : ''}
              {item.date}
            </span>
          )}
          {item.meta.map((m) => (
            <span key={m} className="text-[10px] font-mono text-muted-foreground/65">{m}</span>
          ))}
          {/* The course link, changeable here rather than only through the
              assistant — this was the one thing the panel could not do. */}
          <select
            value={item.courseId ?? ''}
            onChange={(e) => onCourse(e.target.value ? Number(e.target.value) : null)}
            aria-label="Course"
            className={`text-[10px] font-mono bg-transparent border rounded px-1 py-0.5 max-w-[10rem] truncate focus:outline-none focus:ring-1 focus:ring-primary/50 ${
              item.courseId ? 'border-transparent text-muted-foreground/65 hover:border-border/60' : 'border-border/60 text-amber-400/80'
            }`}
          >
            <option value="">no course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code ?? c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {item.status === 'graded' && <GradeInput value={item.grade} onSave={onGrade} />}

      <button
        onClick={onAdvance}
        title={`Mark as ${next}`}
        className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full hover:opacity-80 ${STATUS_STYLE[item.status] ?? STATUS_STYLE.todo}`}
      >
        {item.status}
      </button>

      <button
        onClick={onOpen}
        title="View / edit"
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-all"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}

function GradeInput({ value, onSave }: { value: string | null; onSave: (grade: string) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  // A grade saved elsewhere (the detail panel, the assistant) has to show up
  // here, but not while the field is being typed into. Reset during render
  // rather than in an effect, so no intermediate stale value is painted.
  const [lastSaved, setLastSaved] = useState(value)
  if (lastSaved !== value) {
    setLastSaved(value)
    setDraft(value ?? '')
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value ?? '')) onSave(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      placeholder="grade"
      aria-label="Grade"
      className="shrink-0 w-14 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-muted/40 border border-border/40 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
    />
  )
}

function ComposerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">{title}</p>
        <button onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

function CourseComposer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [semester, setSemester] = useState('')
  const [credits, setCredits] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    await fetch('/api/school', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'course', name, code, semester, credits: credits || undefined }),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <ComposerShell title="New course" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" className={`${input} sm:col-span-2`} />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className={input} />
        <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Semester" className={input} />
        <input value={credits} onChange={(e) => setCredits(e.target.value)} inputMode="numeric" placeholder="Credits" className={input} />
        <button type="submit" disabled={!name.trim() || saving} className="sm:col-span-2 lg:col-span-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
          {saving ? 'Adding…' : 'Add course'}
        </button>
      </form>
    </ComposerShell>
  )
}

function ItemComposer({
  kind, courses, onClose, onCreated,
}: {
  kind: 'assignment' | 'exam'
  courses: Course[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  // One course means there is nothing to choose: pre-select it.
  const [courseId, setCourseId] = useState<number | null>(courses.length === 1 ? courses[0].id : null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    await fetch('/api/school', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        kind === 'exam'
          ? { kind, name, courseId, date, time, location }
          : { kind, name, courseId, dueDate: date },
      ),
    })
    setSaving(false)
    onCreated()
  }

  return (
    <ComposerShell title={kind === 'exam' ? 'New exam' : 'New assignment'} onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'exam' ? 'Exam name' : 'Assignment name'}
          className={`${input} sm:col-span-2`}
        />
        <select value={courseId ?? ''} onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)} aria-label="Course" className={input}>
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} aria-label={kind === 'exam' ? 'Date' : 'Due date'} />
        {kind === 'exam' && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} aria-label="Time" />}
        {kind === 'exam' && <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className={input} />}
        <button type="submit" disabled={!name.trim() || saving} className="sm:col-span-2 lg:col-span-1 text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
          {saving ? 'Adding…' : kind === 'exam' ? 'Add exam' : 'Add assignment'}
        </button>
      </form>
      {courses.length === 0 && (
        <p className="text-[10px] font-mono text-muted-foreground/60 mt-2">
          <FileText className="w-3 h-3 inline mr-1" />
          No courses yet — this will sit under “No course” until you file it.
        </p>
      )}
    </ComposerShell>
  )
}
