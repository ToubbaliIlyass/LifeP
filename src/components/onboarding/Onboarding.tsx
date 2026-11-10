'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import { SAY } from '@/lib/tuck/events'
import { TUCK_LINES } from '@/lib/tuck/states'
import { daysLabel } from '@/lib/days'
import type { WeekItem } from '@/lib/onboarding-speech'
import { startListening } from '@/components/today/TodayAssistant'
import { clockZone } from '@/lib/wallclock'
import { VoiceStep } from './VoiceStep'
import { BTN_PRIMARY } from '@/components/ui/buttons'

/**
 * Setup: the two things the planner cannot work out by watching.
 *
 * Everything else Acture learns from use — when things really get done, how
 * long they take, what goes together. What it cannot learn that way is where
 * the day starts and ends, and which hours are already spoken for; guess
 * those wrong and the very first plan puts a to-do in the middle of a class.
 * So that is all this asks. Palettes, routines, goals and a free-text interview
 * used to be asked here too: each is either a preference (Settings), or
 * something better said to the assistant the moment it comes up.
 *
 * Both answers can be skipped, and both can be changed later.
 *
 * Tuck opens it: one welcome page that says who it is, how to talk to it and
 * what the three questions are, then the questions. Skip is there from the first.
 */

/** The one question: what is fixed in the week. Who they are becoming and when they like to work are learned from use, or said to Tuck. */
const QUESTIONS = [
  { step: 'week', title: 'Your week', why: 'What’s already fixed: classes, shifts, training.', becomes: 'Becomes weekly events on your calendar, and nothing gets planned over them.' },
] as const

/** JSON, plus the user's clock zone, so "today" on the server is today where they are. */
function zoneHeaders(): Record<string, string> {
  const zone = clockZone()
  return { 'Content-Type': 'application/json', ...(zone ? { 'x-time-zone': zone } : {}) }
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [week, setWeek] = useState<WeekItem[]>([])
  const [busy, setBusy] = useState<'saving' | 'skipping' | null>(null)
  /** 0 is Tuck’s welcome; 1 is the one question, answered by talking. */
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState(false)

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
      // The same route as finishing, with nothing said: it records the decision and still leaves the first project.
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: zoneHeaders(),
        body: JSON.stringify({}),
      })
    } catch { /* see above */ }
    setBusy(null)
    onDone()
  }

  async function finish() {
    if (busy) return
    setBusy('saving')
    setFailed(false)
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: zoneHeaders(),
      body: JSON.stringify({
        // The week's fixed things become weekly Events on the calendar.
        commitments: week.map((c) => ({ name: c.name, daysOfWeek: c.days, time: c.time, duration: c.minutes, frequency: 'weekly' })),
        rules: [],
      }),
    }).catch(() => null)
    setBusy(null)
    // Closing over a failed save would end setup with none of it written.
    if (!res?.ok) { setFailed(true); return }
    // Set up: Tuck celebrates once, in the corner, over the first list.
    window.dispatchEvent(new CustomEvent(SAY, { detail: { state: 'celebrating', line: 'We did it! Your first plan starts here.' } }))
    onDone()
    // The first plan: straight into Tell Tuck, so the day is not empty when they arrive.
    window.setTimeout(() => startListening('What’s on your plate today?'), 900)
  }

  if (step === 0) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Meet Tuck" className="fixed inset-0 z-[60] overflow-hidden bg-background">
        <div className="mx-auto flex h-dvh w-full max-w-[760px] flex-col px-5 py-3 lg:py-6">
          <div className="flex justify-end">
            <button onClick={skip} disabled={!!busy} className="text-[length:calc(13px*var(--ts))] text-muted-foreground hover:text-foreground">{busy === 'skipping' ? 'Skipping…' : 'Skip setup'}</button>
          </div>

          {/* One centred column: Tuck, a greeting, one line, one button. */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
            <Tuck state="onboarding-hello" size={520} alt={`Tuck. ${TUCK_LINES['onboarding-hello']}`} className="!w-auto !h-[clamp(120px,42dvh,600px)] max-w-[90vw] aspect-[320/300]" />
            <h1 className="mt-[clamp(4px,1.5dvh,16px)] text-[clamp(30px,7dvh,60px)] font-bold leading-none tracking-tight">Hi, I’m Tuck.</h1>
            <p className="mt-[clamp(6px,1.8dvh,16px)] max-w-[30ch] text-[clamp(16px,3dvh,22px)] leading-snug text-foreground/75">
              Say what needs to happen, and I’ll turn it into a plan for your day.
            </p>
            <button autoFocus onClick={() => setStep(1)} className="mt-[clamp(14px,4dvh,36px)] rounded-xl bg-primary text-primary-foreground px-10 py-[clamp(10px,2dvh,16px)] text-[length:calc(17px*var(--ts))] font-bold hover:opacity-90">Let’s start</button>
            <p className="mt-3 text-[length:calc(13.5px*var(--ts))] text-muted-foreground">One quick question · just talk</p>
          </div>
        </div>
      </div>
    )
  }

  const at = step - 1
  const q = QUESTIONS[at]
  const answers = [week.length]

  /** The way on, right under the answer: a real button once something was said, a quiet one before. */
  const action = (
    <>
      {failed && <p role="alert" className="mb-2 text-[length:calc(14px*var(--ts))] text-destructive">I couldn’t save that. Try again.</p>}
      {answers[at] > 0 ? (
        <button onClick={finish} disabled={!!busy} className={`${BTN_PRIMARY} !h-12 w-full`}>
          {busy === 'saving' ? 'Saving…' : 'Looks good, start'}
        </button>
      ) : (
        <button onClick={finish} disabled={!!busy} className="inline-flex min-h-11 items-center px-3 text-[length:calc(14px*var(--ts))] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60">
          {busy === 'saving' ? 'Saving…' : 'Nothing fixed, start'}
        </button>
      )}
    </>
  )

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up Acture" className="fixed inset-0 z-[60] overflow-hidden bg-background">
      <div className="mx-auto flex h-dvh w-full max-w-[760px] flex-col px-5 py-3 lg:py-6">
        {/* Quiet: back on the left, where you are in the middle, skip on the right. */}
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center text-[length:calc(13px*var(--ts))] text-muted-foreground">
          <button onClick={() => setStep(step - 1)} disabled={!!busy} className="flex items-center gap-1 justify-self-start hover:text-foreground"><ArrowLeft className="w-4 h-4" />Back</button>
          <div className="flex items-center gap-2.5" aria-label={`Step ${at + 1} of ${QUESTIONS.length}: ${q.title}`}>
            <span className="font-medium text-foreground">{q.title}</span>
          </div>
          <button onClick={skip} disabled={!!busy} className="justify-self-end hover:text-foreground">{busy === 'skipping' ? 'Skipping…' : 'Skip setup'}</button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col justify-center py-[clamp(6px,2dvh,24px)]">
          {q.step === 'week' && (
            <VoiceStep key="week" step="week" tuck="onboarding-ready" ask="What’s fixed in your week?" example="Lectures Monday and Wednesday at 10 for two hours, work Fridays 2 to 6" items={week} onItems={setWeek} action={action}
              row={(c) => <><b className="font-semibold">{c.name}</b> <span className="text-muted-foreground">· {daysLabel(c.days)} · {c.time} · {c.minutes < 60 ? `${c.minutes} min` : `${+(c.minutes / 60).toFixed(1)} h`}</span></>} />
          )}
        </main>
      </div>
    </div>
  )
}
