'use client'

import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

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
  todo: 'bg-muted text-muted-foreground',
  submitted: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  graded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
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
      <div className="px-4 py-3 border-b shrink-0">
        <p className="text-sm font-semibold">School</p>
        {courses.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        )}
      </div>
      <ScrollArea className="flex-1">
        {loading && <p className="text-sm text-muted-foreground text-center pt-8">Loading…</p>}
        {!loading && courses.length === 0 && (
          <p className="text-sm text-muted-foreground text-center pt-8 px-4">
            No courses yet — tell the AI about your courses, assignments, or exams.
          </p>
        )}
        {!loading && courses.length > 0 && (
          <div className="p-3 space-y-3">
            {courses.map((course) => (
              <div key={course.id} className="border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(course.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{course.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {course.code && <span className="text-xs text-indigo-500">{course.code}</span>}
                      {course.semester && <span className="text-xs text-indigo-400">{course.semester}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-indigo-500">
                      {course.assignments.length}A · {course.exams.length}E
                    </span>
                    <span className="text-indigo-400 text-xs">{expanded.has(course.id) ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded.has(course.id) && (course.assignments.length > 0 || course.exams.length > 0) && (
                  <div className="divide-y">
                    {course.exams.map((exam) => (
                      <div key={exam.id} className="px-3 py-2 bg-rose-50/50 dark:bg-rose-950/30">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-medium ${exam.status === 'taken' || exam.status === 'graded' ? 'line-through text-muted-foreground' : 'text-rose-800 dark:text-rose-200'}`}>
                            📝 {exam.name}
                          </p>
                          {exam.grade && <span className="text-xs font-bold text-emerald-600">{exam.grade}</span>}
                        </div>
                        <div className="flex gap-2 mt-0.5 flex-wrap">
                          {exam.date && <span className={`text-[10px] ${isOverdue(exam.date, exam.status) ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>{exam.date}</span>}
                          {exam.time && <span className="text-[10px] text-muted-foreground">{exam.time}</span>}
                          {exam.location && <span className="text-[10px] text-muted-foreground">@ {exam.location}</span>}
                        </div>
                      </div>
                    ))}
                    {course.assignments.map((a) => (
                      <div key={a.id} className="px-3 py-2 bg-card">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-medium ${a.status === 'graded' ? 'line-through text-muted-foreground' : ''}`}>
                            {a.name}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {a.grade && <span className="text-xs font-bold text-emerald-600">{a.grade}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ASSIGNMENT_STATUS[a.status] ?? ASSIGNMENT_STATUS.todo}`}>
                              {a.status}
                            </span>
                          </div>
                        </div>
                        {a.dueDate && (
                          <p className={`text-[10px] mt-0.5 ${isOverdue(a.dueDate, a.status) ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            {isOverdue(a.dueDate, a.status) ? 'Overdue · ' : 'Due '}{a.dueDate}
                          </p>
                        )}
                      </div>
                    ))}
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
