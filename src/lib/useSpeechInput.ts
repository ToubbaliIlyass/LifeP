'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Live dictation.
 *
 * Uses the browser's own SpeechRecognition rather than sending audio to
 * Whisper, because the requirement is that words appear *while* speaking.
 * Whisper needs a finished recording uploaded and transcribed, which is a
 * pause of a second or more at the end; this streams interim guesses as you
 * talk and firms them up as it goes, which is the difference between feeling
 * instant and feeling like a round trip.
 *
 * The trade-off worth knowing: in Chrome the audio goes to Google's servers
 * for recognition, and Firefox does not implement this at all — hence
 * `supported`, so callers can hide the control rather than offer a button
 * that does nothing.
 */

// Minimal shapes for an API TypeScript's DOM lib still does not cover.
interface SpeechAlt { transcript: string }
interface SpeechResult { 0: SpeechAlt; isFinal: boolean; length: number }
interface SpeechResultList { length: number; [i: number]: SpeechResult }
interface SpeechEvent extends Event { resultIndex: number; results: SpeechResultList }
interface SpeechErrorEvent extends Event { error: string }

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface SpeechInput {
  supported: boolean
  listening: boolean
  /** Confirmed words plus the current in-progress guess. */
  transcript: string
  error: string | null
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechInput(onFinalText?: (text: string) => void): SpeechInput {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const onFinalRef = useRef(onFinalText)
  onFinalRef.current = onFinalText

  useEffect(() => { setSupported(getCtor() !== null) }, [])

  const stop = useCallback(() => {
    recognition.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { setError('This browser cannot listen.'); return }

    // Starting again without ending the previous session left two live
    // recognizers transcribing the same microphone into the same buffer, so
    // every word landed twice. Overwriting the ref does not stop the old one
    // — only abort() does.
    recognition.current?.abort()

    setError(null)
    const rec = new Ctor()
    // continuous keeps it running through natural pauses; interimResults is
    // what makes words appear before the sentence is finished.
    rec.continuous = true
    rec.interimResults = true
    rec.lang = navigator.language || 'en-US'

    /*
     * Rebuilt from the full result list every time rather than appended to.
     *
     * `e.results` is cumulative for the whole session, and `e.resultIndex`
     * only marks where the browser started changing things — it is not a
     * promise that everything from there on is new. Chrome re-delivers
     * already-finalised results routinely, and the old code appended each one
     * again on every delivery, which is why words piled up repeated.
     *
     * Reading the whole list and replacing the transcript makes the handler
     * idempotent: the same event delivered ten times produces the same text,
     * so no re-delivery can duplicate anything.
     */
    rec.onresult = (e: SpeechEvent) => {
      let final = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result[0].transcript
        if (result.isFinal) final += text
        else interim += text
      }

      final = final.replace(/\s+/g, ' ').trim()
      finalRef.current = final
      setFinalText(final)
      setInterimText(interim.replace(/\s+/g, ' ').trim())
      if (final) onFinalRef.current?.(final)
    }

    rec.onerror = (e: SpeechErrorEvent) => {
      setError(
        e.error === 'not-allowed'
          ? 'Microphone permission denied.'
          : e.error === 'no-speech'
            ? null // simply nothing said; not worth an error message
            : 'Could not hear you.',
      )
      setListening(false)
    }

    rec.onend = () => setListening(false)

    recognition.current = rec
    rec.start()
    setListening(true)
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setFinalText('')
    setInterimText('')
    setError(null)
  }, [])

  // Leaving the microphone running after unmount would keep the browser's
  // recording indicator on with nothing listening.
  useEffect(() => () => { recognition.current?.abort() }, [])

  return {
    supported,
    listening,
    transcript: (finalText + ' ' + interimText).trim(),
    error,
    start,
    stop,
    reset,
  }
}
