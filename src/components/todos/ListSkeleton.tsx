/**
 * What the list is while it is still on its way: a few quiet rows the shape
 * of real ones, so nothing jumps when the to-dos arrive. Decorative — the
 * splash and the live regions already say "loading" to a screen reader.
 */
export function ListSkeleton() {
  const widths = ['62%', '78%', '48%', '70%']
  return (
    <div aria-hidden className="mt-6 space-y-1">
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
          <span className="h-5 w-5 shrink-0 rounded-full bg-foreground/[0.08] motion-safe:animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
          <span className="h-3.5 rounded-full bg-foreground/[0.08] motion-safe:animate-pulse" style={{ width: w, animationDelay: `${i * 120}ms` }} />
        </div>
      ))}
    </div>
  )
}
