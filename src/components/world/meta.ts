import { Building2, Footprints, Sparkles } from 'lucide-react'
import type { WorldKind } from '@/lib/identity'

/** The three worlds, as the sidebar, Settings and Your World name them. */
export const WORLD_META: Record<WorldKind, { name: string; Icon: React.ComponentType<{ className?: string }>; blurb: string }> = {
  sky:  { name: 'Night sky', Icon: Sparkles,   blurb: 'Each identity a constellation. Every vote a star.' },
  path: { name: 'Path',      Icon: Footprints, blurb: 'A step for every vote, and trees where you kept at it.' },
  city: { name: 'City',      Icon: Building2,  blurb: 'Each identity a district. Every vote a floor.' },
}
