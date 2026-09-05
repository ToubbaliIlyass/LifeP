'use client'

const CheckMark = () => (
  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

/** Shared circular checkbox used everywhere a habit can be marked done — keeps the "done" affordance visually identical across Today, Habits, etc. */
export function CompletionCheckbox({ checked }: { checked: boolean }) {
  return <StatusCheckbox status={checked ? 'done' : 'todo'} />
}

/**
 * Same 18px circular checkbox, extended with a third "in-progress" state
 * (a filled dot rather than a checkmark) — used by Tasks, which cycle
 * through todo → in-progress → done instead of a plain boolean, so it
 * still reads as the same checkbox family as Habits/Today rather than a
 * differently-shaped status dot.
 */
export function StatusCheckbox({ status }: { status: 'todo' | 'in-progress' | 'done' }) {
  if (status === 'done') {
    return (
      <div className="w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all shrink-0 bg-emerald-500 border-emerald-500">
        <CheckMark />
      </div>
    )
  }
  if (status === 'in-progress') {
    return (
      <div className="w-[18px] h-[18px] rounded-full border-2 border-sky-400 flex items-center justify-center transition-all shrink-0">
        <div className="w-[7px] h-[7px] rounded-full bg-sky-400" />
      </div>
    )
  }
  return <div className="w-[18px] h-[18px] rounded-full border border-border/60 transition-all shrink-0" />
}
