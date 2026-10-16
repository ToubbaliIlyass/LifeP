/**
 * The Acture mark: a voice becoming a tick.
 *
 * Two short sound bars run into a check — what you say, done. That is the
 * whole app in one glyph, and it stays legible at 16px, where the old
 * six-polygon aperture turned to a grey blot.
 *
 * Drawn in `currentColor`, so it takes whatever tile or text colour it sits
 * in. `bars` colours the sound bars on their own, for the places the mark
 * appears on its full tile (the favicon, the landing page).
 */
export function ActureMark({ className, bars }: { className?: string; bars?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Acture"
    >
      <path d="M5 14.5v3" stroke={bars ?? 'currentColor'} />
      <path d="M9.5 11.5v9" stroke={bars ?? 'currentColor'} />
      <path d="M14 16.5l4 4L27.5 10" />
    </svg>
  )
}

/** The mark on its own tile, for where nothing around it supplies one. */
export function ActureLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-grid place-items-center rounded-[28%] bg-[#141413] text-white ${className ?? ''}`}>
      <ActureMark className="w-[66%] h-[66%]" bars="#F5A524" />
    </span>
  )
}
