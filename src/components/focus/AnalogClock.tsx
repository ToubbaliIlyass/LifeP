/**
 * A clock face that reads elapsed time, like a stopwatch: the long thin hand
 * goes round once a minute, the short thick one once an hour. The angles keep
 * counting up (never wrap back to 0), so a hand never spins backwards at the
 * top of the turn. Colours come from the theme (`currentColor` and the accent).
 */
export function AnalogClock({ ms, size = 28, running = true, className = '' }: { ms: number; size?: number; running?: boolean; className?: string }) {
  const sec = Math.max(0, ms) / 1000
  const minuteAngle = (sec / 3600) * 360
  const secondAngle = (sec / 60) * 360
  const hand = (angle: number, len: number, width: number, cls: string) => (
    <line
      x1="50" y1="50" x2="50" y2={50 - len}
      strokeWidth={width} strokeLinecap="round"
      className={`${cls} motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[var(--ease-out)]`}
      style={{ transformOrigin: '50px 50px', transform: `rotate(${angle}deg)` }}
    />
  )
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={className}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity="0.9" strokeWidth="6" />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="50" y1="12" x2="50" y2="19" stroke="currentColor" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" style={{ transformOrigin: '50px 50px', transform: `rotate(${a}deg)` }} />
      ))}
      {hand(minuteAngle, 27, 8, 'stroke-current')}
      {hand(secondAngle, 37, 4.5, running ? 'stroke-primary' : 'stroke-muted-foreground')}
      <circle cx="50" cy="50" r="5" fill="currentColor" />
    </svg>
  )
}
