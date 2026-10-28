import { notFound } from 'next/navigation'
import { Tuck } from '@/components/ui/Tuck'
import { TUCK_LINES, TUCK_STATES } from '@/lib/tuck/states'

/*
 * Development only: every pose, light and dark, side by side. Where a state
 * cannot be reached by using the app on demand (a failed save, the server
 * being down), this is where it is looked at. Not found in production.
 *
 *   /dev/tuck            all of them, at 120px
 *   /dev/tuck?size=240   bigger
 *   /dev/tuck?only=idle,error
 *   /dev/tuck?level=bloom    the growth stage on every sprout
 *   /dev/tuck?boom=1         throws, to see the error screen (app/(app)/error.tsx)
 */
export default async function TuckLab({ searchParams }: { searchParams: Promise<{ size?: string; only?: string; level?: string; boom?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { size, only, level, boom } = await searchParams
  if (boom) throw new Error('Tuck: a test error, on purpose')
  const stage = level === 'seed' || level === 'bloom' ? level : null
  const px = Math.min(480, Math.max(48, Number(size) || 120))
  const names = only ? only.split(',') : TUCK_STATES
  const states = TUCK_STATES.filter((s) => names.includes(s))

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <ul className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${px * 2 + 48}px, 1fr))` }}>
        {states.map((s) => (
          <li key={s} data-state-card={s} className="rounded-xl border border-border/70 p-3">
            <p className="text-[13px] font-semibold">{s}</p>
            <p className="mb-2 text-[12px] text-muted-foreground">{TUCK_LINES[s]}</p>
            <div className="flex gap-3">
              <div className="rounded-lg bg-[#fefffe] p-2"><Tuck state={s} size={px} tone="light" level={stage} /></div>
              <div className="rounded-lg bg-[#141415] p-2"><Tuck state={s} size={px} tone="dark" level={stage} /></div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
