/**
 * The Acture aperture mark, from public/acture_logo_aperture.svg.
 *
 * Drawn in `currentColor` rather than the source file's black-on-white,
 * because in the app the mark always sits inside a tinted container that
 * already supplies the tile — a second, hardcoded black square would vanish
 * against a dark sidebar and fight every theme. The favicon at
 * src/app/icon.svg keeps the original colours instead, since browser chrome
 * gives it nothing to inherit.
 *
 * Previously this was duplicated inline in page.tsx and login/page.tsx; one
 * definition means the two cannot drift apart.
 */
export function ActureMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-54 -56 108 108"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Acture"
    >
      <polygon points="0,-52 30,-40 22,-4 -22,-4 -30,-40" />
      <polygon points="45,-8 45,26 12,42 -8,16 12,-16" />
      <polygon points="28,48 -28,48 -38,16 -8,16 12,42" />
      <polygon points="-45,26 -45,-8 -12,-16 8,16 -12,42" />
      <polygon points="-30,-40 0,-52 22,-4 -8,16 -30,4" />
      <polygon points="30,-40 45,-8 12,-16 -8,-4 22,-4" />
      {/* The opening at the centre of the aperture. */}
      <circle cx="0" cy="0" r="13" fill="currentColor" opacity="0.4" />
    </svg>
  )
}
