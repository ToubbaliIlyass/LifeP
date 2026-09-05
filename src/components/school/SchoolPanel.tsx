'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronDown } from 'lucide-react'

interface AssignmentRow {
  id: number
  name: string
  dueDate: string | null
  status: string
  grade: string | null
}

interface ExamRow {
  id: number
  name: string
  date: string | null
  time: string | null
  location: string | null
  status: string
  grade: string | null
}

interface CourseRow {
  id: number
  name: string
  code: string | null
  semester: string | null
  assignments: AssignmentRow[]
  exams: ExamRow[]
}

function isOverdue(date: string | null, status: string) {
  if (!date || status === 'submitted' || status === 'graded' || status === 'taken') return false
  return new Date(date) < new Date(new Date().toDateString())
}

const ASSIGNMENT_STATUS: Record<string, string> = {
  todo: 'bg-muted/60 text-muted-foreground/70',
  submitted: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  graded: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

export function SchoolPanel() {
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/school')
      .then((r) => r.json())
      .then(({ courses: c }: { courses: CourseRow[] }) => {
        setCourses(c)
        setExpanded(new Set(c.map((x) => x.id)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        {loading && <p className="text-[12px] text-muted-foreground/50 text-center pt-10 font-mono">loading…</p>}
        {!loading && courses.length === 0 && (
          <p className="text-[12px] text-muted-foreground/50 text-center pt-10 px-5">
            No courses yet — tell the AI about your courses, assignments, or exams.
          </p>
        )}
        {!loading && courses.length > 0 && (
          <div className="p-4 space-y-3">
            {courses.map((course) => (
              <div key={course.id} className="border border-border/40 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpand(course.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="text-left min-w-0">
                    <p className="text-[13px] font-serif text-foreground/85 truncate">{course.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {course.code && <span className="text-[10px] font-mono text-muted-foreground/65">{course.code}</span>}
                      {course.semester && <span className="text-[10px] font-mono text-muted-foreground/65">{course.semester}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground/65">
                      {course.assignments.length}A · {course.exams.length}E
                    </span>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground/55 transition-transform ${expanded.has(course.id) ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {expanded.has(course.id) && (course.assignments.length > 0 || course.exams.length > 0) && (
                  <div className="p-2 space-y-1 border-t border-border/40">
                    {course.exams.map((exam) => {
                      const done = exam.status === 'taken' || exam.status === 'graded'
                      const overdue = isOverdue(exam.date, exam.status)
                      return (
                        <div key={exam.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? 'bg-emerald-400/60' : 'bg-rose-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-[13px] font-serif truncate ${done ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
                                {exam.name}
                              </p>
                              {exam.grade && <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{exam.grade}</span>}
                            </div>
                            {(exam.date || exam.time || exam.location) && (
                              <div className="flex gap-2 mt-0.5 flex-wrap">
                                {exam.date && (
                                  <span className={`text-[10px] font-mono ${overdue ? 'text-red-400/70' : 'text-muted-foreground/65'}`}>
                                    {overdue ? 'overdue · ' : ''}{exam.date}
                                  </span>
                                )}
                                {exam.time && <span className="text-[10px] font-mono text-muted-foreground/65">{exam.time}</span>}
                                {exam.location && <span className="text-[10px] text-muted-foreground/65">@ {exam.location}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {course.assignments.map((a) => {
                      const overdue = isOverdue(a.dueDate, a.status)
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.status === 'graded' ? 'bg-emerald-400/60' : 'bg-sky-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-[13px] font-serif truncate ${a.status === 'graded' ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
                                {a.name}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {a.grade && <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{a.grade}</span>}
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${ASSIGNMENT_STATUS[a.status] ?? ASSIGNMENT_STATUS.todo}`}>
                                  {a.status}
                                </span>
                              </div>
                            </div>
                            {a.dueDate && (
                              <p className={`text-[10px] font-mono mt-0.5 ${overdue ? 'text-red-400/70' : 'text-muted-foreground/65'}`}>
                                {overdue ? 'overdue · ' : 'due '}{a.dueDate}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
