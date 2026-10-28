'use client'

import { useTodos } from '@/components/todos/TodosProvider'
import { Tuck } from '@/components/ui/Tuck'
import { LEVEL_AT, TUCK_LINES, levelFor, type TuckLevel, type TuckState } from '@/lib/tuck/states'

const LEVEL_NAME = { seed: 'Seed', sprout: 'Sprout', bloom: 'Bloom' } as const
const STAGES: TuckLevel[] = ['seed', 'sprout', 'bloom']

/**
 * Settings, at the foot: who Tuck is, and how far it has grown.
 *
 * Tuck grows with use — a seed at first, a sprout after ten finished to-dos,
 * a bloom after a hundred — and the sprout on its head says so everywhere it
 * appears. Only ever up: nothing is taken away for a missed day.
 */
export function TuckAbout() {
  const { todos } = useTodos()
  const finished = todos.filter((t) => t.done && t.type !== 'Prayer').length
  const level = levelFor(finished)
  const state: TuckState = `level-${level}`
  const next = level === 'seed' ? LEVEL_AT.sprout : level === 'sprout' ? LEVEL_AT.bloom : null
  const from = level === 'seed' ? 0 : LEVEL_AT.sprout
  const pct = next ? Math.min(100, Math.round(((finished - from) / (next - from)) * 100)) : 100

  return (
    <div className="rounded-xl bg-foreground/[0.045] p-4 flex items-center gap-5 max-sm:flex-col max-sm:items-start max-sm:gap-3">
      <Tuck state={state} size={180} alt={`Tuck as a ${LEVEL_NAME[level].toLowerCase()}`} className="max-sm:-ml-2" />
      <div className="min-w-0 flex-1 w-full">
        <p className="text-[17px] font-semibold tracking-tight">{LEVEL_NAME[level]}</p>
        <p className="text-[13.5px] text-foreground/75">{TUCK_LINES[state]}</p>

        {/* Three stops, and how far to the next. */}
        <div className="mt-4" aria-label={`${finished} finished${next ? `, ${next - finished} to the next stage` : ''}`}>
          <div className="h-1.5 rounded-full bg-foreground/[0.10] overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px]">
            {STAGES.map((s) => (
              <span key={s} className={s === level ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                {LEVEL_NAME[s]}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
          {finished} finished{next ? `, ${next - finished} more and I grow.` : '. Fully grown.'}
        </p>
        <p className="mt-2 max-w-[52ch] text-[12.5px] text-muted-foreground">
          Tuck is the gardener behind Acture: it looks after your to-dos and grows a little with every one you finish. Nothing is ever taken away.
        </p>
      </div>
    </div>
  )
}
