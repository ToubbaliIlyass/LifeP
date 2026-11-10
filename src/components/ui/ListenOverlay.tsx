'use client'

import { createPortal } from 'react-dom'
import { Square, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import type { TuckState } from '@/lib/tuck/states'

/**
 * Listening, full screen: Tuck in the middle, the words as they come, one
 * big button to say you are done.
 *
 * The one look for every place the app listens (Tell Tuck, wherever it is pressed),
 * so speaking feels the same wherever it starts. It is the app's own colours
 * — background, foreground and primary — so it follows the theme, light or
 * dark. Drawn into the body, because the island it is opened from is
 * transformed and a fixed child of that would be fixed to the island.
 */
export function ListenOverlay({ state, line, words, onDone, onCancel, busy = false }: {
  state: TuckState
  /** What Tuck says above the words, when nothing has been said yet. */
  line: string
  /** What has been heard so far. */
  words: string
  onDone: () => void
  onCancel: () => void
  /** Turning the recording into text: nothing to press until it is back. */
  busy?: boolean
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Listening" className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-[clamp(10px,2.5dvh,24px)] bg-background/95 px-6 text-center text-foreground backdrop-blur-md animate-in fade-in duration-200">
      <Tuck state={state} size={400} decorative className="!w-auto !h-[clamp(120px,36dvh,420px)] max-w-[88vw] aspect-[320/300]" />

      {!busy && (
        <div className="flex h-8 items-center gap-1" aria-hidden>
          {[10, 22, 16, 30, 12, 26, 18, 30, 14, 22, 11, 25, 16].map((h, i) => (
            <span key={i} className="acture-voice-bar block w-1 rounded-full bg-primary/80" style={{ height: h, animationDelay: `${(i % 5) * 0.12}s` }} />
          ))}
        </div>
      )}

      <p aria-live="polite" className="max-h-[22dvh] max-w-[34ch] overflow-y-auto whitespace-pre-wrap break-words text-[clamp(18px,3.4dvh,28px)] font-semibold leading-snug tracking-tight">
        {busy ? 'Writing that down…' : words || line}
      </p>

      <div className="flex items-center gap-3">
        <button onClick={onDone} disabled={busy} className="flex h-14 items-center gap-2.5 rounded-full bg-primary px-8 text-[length:calc(17px*var(--ts))] font-bold text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-50">
          <Square className="h-4 w-4" fill="currentColor" /> Done
        </button>
        <button onClick={onCancel} disabled={busy} className="flex h-14 items-center gap-2 rounded-full px-5 text-[length:calc(15px*var(--ts))] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
