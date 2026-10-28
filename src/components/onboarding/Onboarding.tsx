'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { SAY } from '@/lib/tuck/events'
import { TUCK_LINES, type TuckState } from '@/lib/tuck/states'
import { DAY_LABELS, DAY_NAMES, DAY_ORDER } from '@/lib/days'

/**
 * Setup: the two things the planner cannot work out by watching.
 *
 * Everything else Acture learns from use — when things really get done, how
 * long they take, what goes together. What it cannot learn that way is where
 * the day starts and ends, and which hours are already spoken for; guess
 * those wrong and the very first plan puts a to-do in the middle of a class.
 * So that is all this asks. Palettes, habits, goals and a free-text interview
 * used to be asked here too: each is either a preference (Settings), or
 * something better said to the assistant the moment it comes up.
 *
 * Both answers can be skipped, and both can be changed later.
 *
 * Tuck opens it: two short steps to say who it is and how to talk to it, then
 * the one real question. Skip is there from the first.
 */

interface Commitment {
  name: string
  daysOfWeek: number[]
  time: string
  duration: number
}

const FIELD = 'bg-foreground/[0.05] rounded-md px-2 py-1 text-[13.5px] leading-5 outline-none focus:ring-1 focus:ring-primary'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05] disabled:opacity-60'
const HEADING = 'text-[14px] font-bold text-primary mt-7 mb-1.5 pb-1.5 border-b border-border/80'
const HINT = 'text-[12.5px] text-muted-foreground mb-3'

/** The two steps before the question: who Tuck is, and how to talk to it. */
const INTRO: { state: TuckState; title: string; text: string }[] = [
  { state: 'onboarding-hello', title: 'Hi, I’m Tuck.', text: 'I look after your to-dos. Say what needs to happen, and I’ll turn it into a plan for your day.' },
  { state: 'onboarding-show-me', title: 'Just tell me, or show me.', text: 'Speak it, type it, or hand me a photo of a timetable or a screenshot of a message. I’ll sort it out.' },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [busy, setBusy] = useState<'saving' | 'skipping' | null>(null)
  /** 0 and 1 are Tuck's introduction; 2 is the setup itself. */
  const [step, setStep] = useState(0)

  const setCommitment = (i: number, changes: Partial<Commitment>) =>
    setCommitments((list) => list.map((c, j) => (j === i ? { ...c, ...changes } : c)))

  /*
   * Skipping is a decision, and it has to be recorded as one — otherwise the
   * next load reads "setup unanswered" and opens this again. Awaited, and
   * they are let out even if the request fails: being trapped in setup is
   * worse than being asked twice.
   */
  async function skip() {
    if (busy) return
    setBusy('skipping')
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding: { completed: true, completedAt: new Date().toISOString() } }),
      })
    } catch { /* see above */ }
    setBusy(null)
    onDone()
  }

  async function finish() {
    if (busy) return
    setBusy('saving')
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // A commitment needs a name, a day and a time to be put anywhere.
        commitments: commitments
          .filter((c) => c.name.trim() && c.time && c.daysOfWeek.length)
          .map((c) => ({ ...c, frequency: 'weekly' })),
      }),
    }).catch(() => null)
    setBusy(null)
    // Closing over a failed save would end setup with none of it written.
    if (!res?.ok) { alert('Could not save your setup — please try again.'); return }
    // Set up: Tuck celebrates once, in the corner, over the first list.
    window.dispatchEvent(new CustomEvent(SAY, { detail: { state: 'celebrating', line: 'We did it! Your first plan starts here.' } }))
    onDone()
  }

  if (step < INTRO.length) {
    const { state, title, text } = INTRO[step]
    return (
      <div role="dialog" aria-modal="true" aria-label="Meet Tuck" className="fixed inset-0 z-[60] overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-full max-w-[460px] flex-col items-center justify-center px-6 py-12 text-center">
          <Tuck key={state} state={state} size={280} alt={`Tuck. ${TUCK_LINES[state]}`} />
          <h1 className="mt-4 text-[26px] font-bold leading-8 tracking-tight">{title}</h1>
          <p className="mt-2 text-[15px] text-foreground/75">{text}</p>
          <div className="mt-7 flex items-center gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className={BUTTON}>Back</button>}
            <button autoFocus onClick={() => setStep(step + 1)} className="rounded-md bg-primary text-primary-foreground px-3.5 py-1.5 text-[13.5px] font-semibold hover:opacity-90">Next</button>
            <button onClick={skip} disabled={!!busy} className={`${BUTTON} border-transparent text-muted-foreground`}>{busy === 'skipping' ? 'Skipping…' : 'Skip'}</button>
          </div>
          <p className="mt-6 text-[12px] text-muted-foreground tabular-nums" aria-label={`Step ${step + 1} of 3`}>{step + 1} / 3</p>
        </div>
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up Acture" className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      <div className="mx-auto max-w-[560px] px-6 pt-[10vh] pb-16 text-[14px]">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-[22px] font-bold leading-7 tracking-tight">One thing before your first plan</h1>
          <Tuck state="onboarding-ready" size={168} alt="Tuck, ready when you are" className="max-sm:hidden" />
        </div>
        <p className="mt-1.5 text-foreground/75">
          Acture learns when you do things from what you do. What it can’t guess is what’s already fixed — get that wrong and a to-do lands in the middle of your class.
        </p>

        <h2 className={HEADING}>Fixed in your week</h2>
        <p className={HINT}>Classes, shifts, training — whatever happens at the same time each week. Nothing is planned over them. Leave it empty if there is nothing.</p>
        <div className="space-y-3">
          {commitments.map((c, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5">
                <input value={c.name} placeholder="Lecture" aria-label="Name" autoFocus={!c.name} onChange={(e) => setCommitment(i, { name: e.target.value })} className={`${FIELD} flex-1 min-w-0`} />
                <input type="time" value={c.time} aria-label="Starts at" onChange={(e) => setCommitment(i, { time: e.target.value })} className={`${FIELD} tabular-nums`} />
                <select value={c.duration} aria-label="How long" onChange={(e) => setCommitment(i, { duration: Number(e.target.value) })} className={FIELD}>
                  {[30, 45, 60, 90, 120, 180, 240, 480].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
                  ))}
                </select>
                <button onClick={() => setCommitments((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${c.name || 'this'}`} className="grid place-items-center w-7 h-7 shrink-0 rounded-md text-muted-foreground hover:text-red-500 hover:bg-foreground/[0.05]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {DAY_ORDER.map((d) => {
                  const on = c.daysOfWeek.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_NAMES[d]}
                      onClick={() => setCommitment(i, { daysOfWeek: on ? c.daysOfWeek.filter((x) => x !== d) : [...c.daysOfWeek, d].sort((a, b) => a - b) })}
                      className={`w-6 h-6 rounded text-[11px] font-semibold ${on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground'}`}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setCommitments((list) => [...list, { name: '', daysOfWeek: [], time: '', duration: 60 }])} className={`${BUTTON} mt-2.5`}>
          <Plus className="w-3.5 h-3.5" /> Add one
        </button>

        <div className="flex items-center gap-2 mt-10">
          <button onClick={() => setStep(step - 1)} disabled={!!busy} className={BUTTON}>Back</button>
          <button onClick={finish} disabled={!!busy} className="rounded-md bg-primary text-primary-foreground px-3.5 py-1.5 text-[13.5px] font-semibold hover:opacity-90 disabled:opacity-60">
            {busy === 'saving' ? 'Saving…' : 'Start using Acture'}
          </button>
          <button onClick={skip} disabled={!!busy} className={`${BUTTON} border-transparent text-muted-foreground`}>
            {busy === 'skipping' ? 'Skipping…' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}
