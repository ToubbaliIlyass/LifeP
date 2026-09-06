'use client'

import { Mic, Square } from 'lucide-react'

/**
 * Push to talk. Hidden entirely where the browser cannot listen, rather than
 * offered as a button that does nothing.
 */
export function MicButton({
  listening,
  supported,
  onStart,
  onStop,
  className = '',
}: {
  listening: boolean
  supported: boolean
  onStart: () => void
  onStop: () => void
  className?: string
}) {
  if (!supported) return null

  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      aria-label={listening ? 'Stop dictating' : 'Dictate'}
      title={listening ? 'Stop' : 'Speak instead of typing'}
      className={`relative shrink-0 flex items-center justify-center rounded-lg transition-colors ${
        listening
          ? 'text-destructive'
          : 'text-muted-foreground/55 hover:text-foreground hover:bg-muted/40'
      } ${className}`}
    >
      {listening ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
      {listening && (
        // A quiet pulse is the only signal that it is still listening during
        // a pause in speech.
        <span className="absolute inset-0 rounded-lg animate-ping bg-destructive/20 motion-reduce:animate-none" />
      )}
    </button>
  )
}
