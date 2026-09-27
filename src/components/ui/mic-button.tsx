'use client'

import { Mic, Square, Loader2 } from 'lucide-react'
import type { SpeechInput } from '@/lib/useSpeechInput'

/**
 * Push to talk.
 *
 * Takes the whole hook rather than four props, because the states it has to
 * show are not independent: `record` mode has no live text, so the only
 * feedback between pressing stop and the words arriving is the spinner here.
 * Hidden only where neither dictation route exists at all.
 */
export function MicButton({ speech, className = '' }: { speech: SpeechInput; className?: string }) {
  const { supported, listening, transcribing, mode, error } = speech
  if (!supported) return null

  const busy = listening || transcribing
  const label = transcribing ? 'Transcribing' : listening ? 'Stop dictating' : 'Dictate'
  const hint = error
    ?? (transcribing ? 'Writing down what you said…'
      : listening ? (mode === 'record' ? 'Recording — press to finish' : 'Listening — press to stop')
      : mode === 'record' ? 'Record, then it gets written down' : 'Speak instead of typing')

  return (
    <button
      type="button"
      onClick={() => (listening ? speech.stop() : speech.start())}
      disabled={transcribing}
      aria-label={label}
      title={hint}
      className={`relative shrink-0 flex items-center justify-center rounded-lg transition-colors ${
        busy
          ? 'text-destructive'
          : error
            ? 'text-destructive/60 hover:text-destructive'
            : 'text-muted-foreground/55 hover:text-foreground hover:bg-muted/40'
      } ${className}`}
    >
      {transcribing ? (
        <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
      ) : listening ? (
        <Square className="w-4 h-4 fill-current" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
      {listening && (
        // A quiet pulse is the only signal that it is still listening during
        // a pause in speech.
        <span className="absolute inset-0 rounded-lg animate-ping bg-destructive/20 motion-reduce:animate-none" />
      )}
    </button>
  )
}
