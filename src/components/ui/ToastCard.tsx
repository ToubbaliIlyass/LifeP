'use client'

import { Undo2, X } from 'lucide-react'
import { Tuck } from '@/components/ui/Tuck'
import type { TuckState } from '@/lib/tuck/states'
import { BTN_PRIMARY } from '@/components/ui/buttons'

/**
 * The small card that says what just happened and holds the way back.
 *
 * One shape for every "Undo" in the app, so it looks the same whichever
 * made it. On a phone it is a full-width card above the bottom controls,
 * the message on top and an Undo button across the bottom that a thumb
 * can hit, at reading size;
 * on a wide screen it is a compact card centred on the content, not on the
 * window, so it does not sit half over the sidebar.
 */
export function ToastCard({ tuck, text, action, onDismiss, timerKey, seconds = 6 }: {
  tuck: TuckState
  text: string
  action?: { label: string; onClick: () => void; busy?: boolean }
  onDismiss: () => void
  /** Restarts the line that runs down the time left to change your mind. */
  timerKey?: number | string
  seconds?: number
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[65] flex justify-center px-3 md:bottom-24 md:left-[var(--sb)]"
    >
      <div className="acture-toast pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_2px_4px_rgb(0_0_0/0.06),0_16px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-center gap-3 py-2.5 pl-3 pr-2.5 max-md:grid max-md:grid-cols-[auto_1fr_auto] max-md:gap-y-2.5 max-md:py-3 max-md:pr-2">
          <Tuck state={tuck} size={48} decorative className="shrink-0 max-md:h-14 max-md:w-14" />
          <p className="min-w-0 flex-1 text-[length:calc(14px*var(--ts))] leading-snug [overflow-wrap:anywhere] max-md:text-[length:calc(16px*var(--ts))]">{text}</p>
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.busy}
              className={`${BTN_PRIMARY} shrink-0 max-md:order-last max-md:col-span-3 max-md:mr-1`}
            >
              <Undo2 className="h-4 w-4" /> {action.label}
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground max-md:h-11 max-md:w-11"
          >
            <X className="h-4 w-4 max-md:h-5 max-md:w-5" />
          </button>
        </div>
        {/* The time left to change your mind. */}
        <div key={timerKey} className="acture-toast-timer h-[3px] bg-primary/60" style={{ animationDuration: `${seconds}s` }} aria-hidden />
      </div>
    </div>
  )
}
