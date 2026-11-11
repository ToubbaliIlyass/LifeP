'use client'

import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import { LEVEL_AT, levelFor, type TuckLevel, type TuckState } from '@/lib/tuck/states'

const LEVEL_NAME = { seed: 'Seed', sprout: 'Sprout', bloom: 'Bloom' } as const
const STAGES: TuckLevel[] = ['seed', 'sprout', 'bloom']

/**
 * Settings, at the top: who Tuck is, and how far it has grown.
 *
 * Tuck grows with use — a seed at first, a sprout after ten finished to-dos,
 * a bloom after a hundred — and the sprout on its head says so everywhere it
 * appears. Only ever up: nothing is taken away for a missed day.
 */
export function TuckAbout() {
  const { todos } = useTodos()
  const finished = todos.filter((t) => t.done && !t.prayerKey).length
  const level = levelFor(finished)
  const state: TuckState = `level-${level}`
  const next = level === 'seed' ? LEVEL_AT.sprout : level === 'sprout' ? LEVEL_AT.bloom : null
  const from = level === 'seed' ? 0 : LEVEL_AT.sprout
  const pct = next ? Math.min(100, Math.round(((finished - from) / (next - from)) * 100)) : 100

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] to-primary/[0.04] p-5 max-sm:gap-4 max-sm:p-4">
      <Tuck state={state} size={320} alt={`Tuck as a ${LEVEL_NAME[level].toLowerCase()}`} className="max-w-full max-sm:[zoom:0.68]" />
      <div className="w-full min-w-0 max-w-[34rem]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[length:calc(22px*var(--ts))] font-bold leading-none tracking-tight">{LEVEL_NAME[level]}</p>
          <p className="text-[length:calc(14px*var(--ts))] font-semibold tabular-nums text-foreground/75">{next ? `${finished} / ${next}` : `${finished} done`}</p>
        </div>

        {/* Three stops on one track, filled as far as you have come. */}
        <div
          className="relative mt-5 mb-1"
          role="progressbar"
          aria-label="Tuck's growth"
          aria-valuemin={0}
          aria-valuemax={next ?? finished}
          aria-valuenow={finished}
          aria-valuetext={`${finished} finished${next ? `, ${next - finished} to the next stage` : ''}`}
        >
          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.1]">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 text-[length:calc(13px*var(--ts))]">
          {STAGES.map((s, i) => {
            const reached = STAGES.indexOf(level) >= i
            return (
              <span key={s} className={`flex items-center gap-1.5 ${i === 1 ? 'justify-center' : i === 2 ? 'justify-end' : ''} ${s === level ? 'font-semibold text-foreground' : reached ? 'text-foreground/70' : 'text-muted-foreground'}`}>
                <span className={`h-2 w-2 rounded-full ${reached ? 'bg-primary' : 'bg-foreground/20'}`} />
                {LEVEL_NAME[s]}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
