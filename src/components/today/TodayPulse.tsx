'use client'

import { Target, AlertTriangle } from 'lucide-react'
import type { ActiveProject, GoalNudge, Pulse } from '@/lib/today'

/**
 * The three sections Today shows beneath the Now timeline.
 *
 * Kept in one file because they share a visual language and a single fetch,
 * and because each is small: three numbers, five rows, one sentence.
 */

function Heading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest">{children}</h2>
      {action}
    </div>
  )
}

/** How the last seven days actually went, and what slipped yesterday. */
export function PulseStrip({ pulse, onNavigate }: { pulse: Pulse; onNavigate?: (tab: string) => void }) {
  const { habits, tasks, yesterday } = pulse
  // Nothing tracked yet is not a score of zero — it is no score.
  if (habits.due === 0 && tasks.completed === 0 && tasks.overdue === 0) return null

  return (
    <section className="mb-9">
      <Heading
        action={
          <button
            onClick={() => onNavigate?.('activity')}
            className="text-[10px] text-muted-foreground/65 hover:text-muted-foreground transition-colors font-mono"
          >
            full review →
          </button>
        }
      >
        Last 7 days
      </Heading>

      <div className="grid grid-cols-3 gap-2">
        <div className="px-3 py-2.5 rounded-lg bg-muted/20">
          <p className="text-[18px] text-foreground/85 tabular-nums">
            {habits.rate === null ? '—' : `${habits.rate}%`}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">
            habits · {habits.done}/{habits.due}
          </p>
        </div>
        <div className="px-3 py-2.5 rounded-lg bg-muted/20">
          <p className="text-[18px] text-foreground/85 tabular-nums">{tasks.completed}</p>
          <p className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">tasks done</p>
        </div>
        <div className={`px-3 py-2.5 rounded-lg ${tasks.overdue > 0 ? 'bg-amber-500/[0.08]' : 'bg-muted/20'}`}>
          <p className={`text-[18px] tabular-nums ${tasks.overdue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/85'}`}>
            {tasks.overdue}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/55 mt-0.5">running late</p>
        </div>
      </div>

      {/* The one thing the Now timeline cannot tell you: what you missed. */}
      {yesterday.missed.length > 0 && (
        <p className="mt-2.5 text-[11px] text-muted-foreground/60 leading-relaxed">
          Yesterday you logged {yesterday.done} of {yesterday.due}. Missed:{' '}
          <span className="text-foreground/70">{yesterday.missed.join(', ')}</span>.
        </p>
      )}
    </section>
  )
}

/** Projects under way, closest to needing attention first. */
export function ProjectList({ projects, onOpen }: { projects: ActiveProject[]; onOpen?: (id: number) => void }) {
  if (projects.length === 0) return null

  return (
    <section className="mb-9">
      <Heading>Projects · {projects.length}</Heading>
      <div className="space-y-1.5">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen?.(p.id)}
            className="block w-full text-left px-3 py-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[13px] text-foreground/85 truncate">{p.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground/55 shrink-0 tabular-nums">
                {p.progress === null ? 'nothing linked' : `${p.done}/${p.total}`}
              </span>
            </div>
            <div className="h-0.5 bg-border/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${p.progress ?? 0}%` }}
              />
            </div>
            {(p.dueDate || (p.daysQuiet !== null && p.daysQuiet >= 7)) && (
              <p className="text-[10px] font-mono text-muted-foreground/45 mt-1.5">
                {p.dueDate && <>due {p.dueDate}</>}
                {p.dueDate && p.daysQuiet !== null && p.daysQuiet >= 7 && <span className="opacity-50"> · </span>}
                {p.daysQuiet !== null && p.daysQuiet >= 7 && <>quiet {p.daysQuiet} days</>}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * One goal, only on the days one is being neglected — see pickGoalNudge.
 * A list of every goal is wallpaper; a single question can be answered.
 */
export function GoalNudgeCard({ nudge, onOpen }: { nudge: GoalNudge | null; onOpen?: (id: number) => void }) {
  if (!nudge) return null

  return (
    <section className="mb-9">
      <button
        onClick={() => onOpen?.(nudge.id)}
        className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border border-border/50 hover:bg-muted/25 transition-colors"
      >
        <Target className="w-4 h-4 text-primary/60 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] text-foreground/85 truncate">{nudge.name}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {nudge.daysQuiet === null
              ? 'Nothing is linked to this yet — what would move it?'
              : `Nothing has moved on this in ${nudge.daysQuiet} days.`}
          </p>
        </div>
      </button>
    </section>
  )
}

/** Shown in place of everything when the day is genuinely empty. */
export function NothingYet({ overdue }: { overdue: number }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[13px] text-muted-foreground/60 italic">
        {overdue > 0
          ? `Nothing scheduled — though ${overdue} ${overdue === 1 ? 'task is' : 'tasks are'} running late.`
          : 'Nothing urgent today. Capture something above, or open the chat.'}
      </p>
      {overdue > 0 && (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600/60 dark:text-amber-400/50 mx-auto mt-2" />
      )}
    </div>
  )
}
