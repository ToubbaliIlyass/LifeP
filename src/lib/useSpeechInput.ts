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
  /*
   * Chrome ends a recognition session on its own after a stretch of silence,
   * even with `continuous` set, and each session's `results` list starts
   * empty. Dictation therefore spans several sessions, and the text has to
   * survive the seams:
   *
   *   committedRef  what earlier sessions in this dictation produced
   *   sessionRef    what the CURRENT session has finalised so far
   *
   * The current session is always rebuilt from scratch (never appended to),
   * which is what stops re-delivered results duplicating words; committedRef
   * only grows when a session actually ends.
   */
  const committedRef = useRef('')
  const sessionRef = useRef('')
  /** Set only when the user presses stop, so auto-restart can tell the difference. */
  const stoppedByUser = useRef(false)
  const onFinalRef = useRef(onFinalText)
  // Kept current in an effect rather than during render: a ref written while
  // rendering is a hazard React explicitly warns about.
  useEffect(() => { onFinalRef.current = onFinalText }, [onFinalText])

  useEffect(() => { setSupported(getCtor() !== null) }, [])

  const join = (a: string, b: string) => `${a} ${b}`.replace(/\s+/g, ' ').trim()

  /** Drops every handler before stopping, so a dying session cannot report state. */
  const teardown = useCallback((rec: SpeechRecognitionLike | null) => {
    if (!rec) return
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    rec.abort()
  }, [])

  const stop = useCallback(() => {
    stoppedByUser.current = true
    recognition.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { setError('This browser cannot listen.'); return }

    // Starting again without ending the previous session left two recognizers
    // on the same microphone, writing into the same buffer — every word twice.
    // Handlers are removed first: abort() fires the old session's `onend`, and
    // that used to switch `listening` back off immediately after the new
    // session had switched it on, which read as the mic quitting on its own.
    teardown(recognition.current)
    recognition.current = null

    setError(null)
    stoppedByUser.current = false
    committedRef.current = ''
    sessionRef.current = ''

    const begin = () => {
      const rec = new Ctor()
      // continuous keeps it running through natural pauses; interimResults is
      // what makes words appear before the sentence is finished.
      rec.continuous = true
      rec.interimResults = true
      rec.lang = navigator.language || 'en-US'

      /*
       * Rebuilt from the whole result list every time rather than appended to.
       *
       * `results` is cumulative for the session, and `resultIndex` only marks
       * where the browser began changing things — it is not a promise that
       * everything after it is new. Chrome re-delivers already-finalised
       * results routinely, and appending each one again is what made words
       * pile up repeated. Rebuilding makes the handler idempotent: the same
       * event delivered ten times produces the same text.
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

        sessionRef.current = final.replace(/\s+/g, ' ').trim()
        const whole = join(committedRef.current, sessionRef.current)
        setFinalText(whole)
        setInterimText(interim.replace(/\s+/g, ' ').trim())
        if (whole) onFinalRef.current?.(whole)
      }

      rec.onerror = (e: SpeechErrorEvent) => {
        if (recognition.current !== rec) return
        // A silent pause is not a failure, and neither is an aborted session;
        // both would otherwise stop dictation the moment the user drew breath.
        if (e.error === 'no-speech' || e.error === 'aborted') return

        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          stoppedByUser.current = true // no point restarting into a refusal
          setError('Microphone permission denied.')
        } else {
          setError('Could not hear you.')
        }
        setListening(false)
      }

      rec.onend = () => {
        if (recognition.current !== rec) return

        // The browser ended the session but the user never asked to stop, so
        // carry the text over and pick straight back up. Without this the mic
        // simply dies mid-sentence after a few seconds of quiet.
        if (!stoppedByUser.current) {
          committedRef.current = join(committedRef.current, sessionRef.current)
          sessionRef.current = ''
          try {
            begin()
            return
          } catch {
            // Fall through and stop cleanly if it refuses to restart.
          }
        }

        recognition.current = null
        setListening(false)
      }

      recognition.current = rec
      rec.start()
    }

    try {
      begin()
      setListening(true)
    } catch {
      setError('Could not start listening.')
      setListening(false)
    }
  }, [teardown])

  const reset = useCallback(() => {
    committedRef.current = ''
    sessionRef.current = ''
    setFinalText('')
    setInterimText('')
    setError(null)
  }, [])

  // Leaving the microphone running after unmount would keep the browser's
  // recording indicator on with nothing listening.
  useEffect(() => {
    const current = recognition
    return () => {
      stoppedByUser.current = true
      const rec = current.current
      if (rec) { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort() }
    }
  }, [])

  return {
    supported,
    listening,
    transcript: `${finalText} ${interimText}`.replace(/\s+/g, ' ').trim(),
    error,
    start,
    stop,
    reset,
  }
}
