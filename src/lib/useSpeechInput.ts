'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Dictation, by whichever route this browser actually supports.
 *
 * There are two, and the hook picks between them without the caller caring:
 *
 *   live    the browser's own SpeechRecognition. Words appear *while* you
 *           speak, which is the whole point — a finished recording uploaded
 *           and transcribed is a pause of a second or more at the end.
 *   record  MediaRecorder plus /api/transcribe. One round trip at the end,
 *           but it works where `live` does not, and it never mishears itself
 *           into repeating a phrase.
 *
 * `live` is not as available as feature-detection suggests. Brave defines
 * `webkitSpeechRecognition` for fingerprinting parity and then removes the
 * speech backend behind it, so it detects as supported and fails with a
 * `network` error the moment it starts — a microphone button that does
 * nothing. Firefox does not implement it at all. So: Brave goes straight to
 * `record`, anything that fails the same way is switched over for the rest
 * of the session, and everyone else keeps the live path.
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

/**
 * Brave, which defines the API and then cannot serve it. Checked by the
 * `navigator.brave` object Brave adds, rather than the user agent, which it
 * deliberately makes indistinguishable from Chrome's.
 */
function isBrave(): boolean {
  return typeof navigator !== 'undefined' && 'brave' in navigator
}

function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

/** Errors that mean the live backend is unreachable, not that the user was quiet. */
const BACKEND_FAILURES = new Set(['network', 'service-not-allowed', 'language-not-supported', 'bad-grammar'])

/** Remembered per tab, so a Brave user pays the failed first attempt once. */
const FALLBACK_KEY = 'acture.dictation.fallback'
function rememberFallback() {
  try { sessionStorage.setItem(FALLBACK_KEY, '1') } catch { /* private mode */ }
}
function fallbackRemembered(): boolean {
  try { return sessionStorage.getItem(FALLBACK_KEY) === '1' } catch { return false }
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/*
 * Joins two pieces of dictation without saying anything twice.
 *
 * Chrome on Android does not honour `continuous` the way desktop does: each
 * "final" result it hands back is frequently the WHOLE utterance so far
 * ("I need", "I need to buy", "I need to buy milk"), and its interim guess
 * repeats the finalised words too. Concatenating those is what produced
 * "I need I need to buy I need to buy milk". So instead of appending blindly:
 *
 *   b already contains a      -> b          (cumulative re-delivery)
 *   a already ends with b     -> a          (repeat of the tail)
 *   a's tail overlaps b's head -> a + rest   (restart picked up mid-phrase)
 *
 * The overlap needs two or more words, so a genuine "that that" survives.
 */
function mergeSpeech(aRaw: string, bRaw: string): string {
  const a = tidy(aRaw)
  const b = tidy(bRaw)
  if (!a) return b
  if (!b) return a
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  if (bl.startsWith(al)) return b
  if (al.endsWith(bl)) return a

  const aw = al.split(' ')
  const bw = bl.split(' ')
  for (let n = Math.min(aw.length, bw.length); n >= 2; n--) {
    if (aw.slice(-n).join(' ') === bw.slice(0, n).join(' ')) {
      return tidy(`${a} ${b.split(' ').slice(n).join(' ')}`)
    }
  }
  return `${a} ${b}`
}

const join = mergeSpeech

/*
 * Last line of defence against Android's re-delivery.
 *
 * mergeSpeech only compares the seam between two pieces, so a phrase that
 * comes back doubled *inside* one result survives it — and on Android it
 * does, repeatedly ("buy milk buy milk and bread"). This removes any run of
 * two or more words immediately followed by the same run again, longest runs
 * first so a four-word repeat is taken whole rather than picked apart.
 *
 * Two words is the floor deliberately: single-word runs would eat the
 * "that that" and "very very" people actually say.
 */
function collapseRepeats(text: string): string {
  const words = tidy(text).split(' ').filter(Boolean)
  if (words.length < 4) return tidy(text)
  const keys = words.map((w) => w.toLowerCase().replace(/[.,!?;:]+$/, ''))

  for (let n = Math.floor(words.length / 2); n >= 2; n--) {
    for (let i = 0; i + 2 * n <= words.length; i++) {
      let same = true
      for (let k = 0; k < n; k++) {
        if (keys[i + k] !== keys[i + n + k]) { same = false; break }
      }
      if (!same) continue
      words.splice(i + n, n)
      keys.splice(i + n, n)
      i-- // the text left behind may repeat again at the same spot
    }
  }
  return words.join(' ')
}

export type SpeechMode = 'live' | 'record'

/**
 * Which route this browser can take, worked out fresh rather than stored.
 *
 * Read through `useSyncExternalStore` instead of an effect because it is a
 * browser fact, not React state: the server has to answer "none" (there is
 * no navigator there), the client answers properly on hydration, and React
 * is told that up front rather than discovering it in a second render.
 */
type Capability = 'live' | 'record' | 'none'

const neverChanges = () => () => {}
const clientCapability = (): Capability => {
  if (getCtor() !== null && !isBrave() && !fallbackRemembered()) return 'live'
  return canRecord() ? 'record' : 'none'
}
const serverCapability = (): Capability => 'none'

export interface SpeechInput {
  supported: boolean
  listening: boolean
  /** Confirmed words plus the current in-progress guess. */
  transcript: string
  error: string | null
  /** Which route this browser ended up on — `record` has no live text. */
  mode: SpeechMode
  /** Only ever true in `record` mode: the clip is being sent off. */
  transcribing: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechInput(onFinalText?: (text: string) => void): SpeechInput {
  const capability = useSyncExternalStore(neverChanges, clientCapability, serverCapability)
  /** Set when the live backend turns out to be a dead end mid-session. */
  const [forcedRecord, setForcedRecord] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
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

  // `record` mode plumbing.
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const onFinalRef = useRef(onFinalText)
  // Kept current in an effect rather than during render: a ref written while
  // rendering is a hazard React explicitly warns about.
  useEffect(() => { onFinalRef.current = onFinalText }, [onFinalText])

  /*
   * The switch to `record` also has to be visible to callbacks that are
   * already running — the live path's own error handler is what throws it —
   * so it is a ref as well as state. State redraws the button; the ref is
   * what `start` and `stop` actually read.
   */
  const forcedRef = useRef(false)
  const forceRecord = useCallback(() => {
    forcedRef.current = true
    setForcedRecord(true)
  }, [])

  const useLive = capability === 'live' && !forcedRecord
  const mode: SpeechMode = useLive ? 'live' : 'record'
  const supported = capability !== 'none'

  /** Drops every handler before stopping, so a dying session cannot report state. */
  const teardown = useCallback((rec: SpeechRecognitionLike | null) => {
    if (!rec) return
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    rec.abort()
  }, [])

  // ── record mode ──────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!canRecord()) { setError('This browser cannot record audio.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Opus in WebM where it is offered (Chromium, Firefox), MP4/AAC on
      // Safari, which supports neither. An empty string lets MediaRecorder
      // pick, which is what Safari needs.
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        // The browser keeps its recording indicator lit until every track is
        // stopped, not just the recorder.
        for (const track of stream.getTracks()) track.stop()
        recorderRef.current = null
        setListening(false)

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < 1024) return // a tap rather than a sentence

        setTranscribing(true)
        try {
          const form = new FormData()
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
          form.append('audio', blob, `dictation.${ext}`)
          form.append('language', navigator.language || 'en')
          const res = await fetch('/api/transcribe', { method: 'POST', body: form })
          const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
          if (!res.ok || !data.text) {
            setError(data.error ?? 'Could not make out that recording.')
            return
          }
          // Appended, so several short takes build one piece of dictation
          // the same way the live path's sessions do.
          committedRef.current = collapseRepeats(join(committedRef.current, data.text))
          setFinalText(committedRef.current)
          onFinalRef.current?.(committedRef.current)
        } catch {
          setError('Could not reach the transcriber.')
        } finally {
          setTranscribing(false)
        }
      }

      recorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      setError(
        name === 'NotAllowedError' ? 'Microphone permission denied.'
          : name === 'NotFoundError' ? 'No microphone found.'
          : 'Could not start recording.',
      )
      setListening(false)
    }
  }, [])

  // ── live mode ────────────────────────────────────────────

  const startLive = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { forceRecord(); void startRecording(); return }

    // Starting again without ending the previous session left two recognizers
    // on the same microphone, writing into the same buffer — every word twice.
    // Handlers are removed first: abort() fires the old session's `onend`, and
    // that used to switch `listening` back off immediately after the new
    // session had switched it on, which read as the mic quitting on its own.
    teardown(recognition.current)
    recognition.current = null

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
          if (result.isFinal) final = join(final, text)
          else interim = join(interim, text)
        }

        sessionRef.current = collapseRepeats(final)
        const whole = collapseRepeats(join(committedRef.current, sessionRef.current))
        setFinalText(whole)
        setInterimText(interim)
        if (whole) onFinalRef.current?.(whole)
      }

      rec.onerror = (e: SpeechErrorEvent) => {
        if (recognition.current !== rec) return
        // A silent pause is not a failure, and neither is an aborted session;
        // both would otherwise stop dictation the moment the user drew breath.
        if (e.error === 'no-speech' || e.error === 'aborted') return

        // The backend this browser claims to have is not actually reachable —
        // Brave's stripped speech service is the common case. Nothing about
        // that improves on a retry, so switch this tab over for good and
        // carry straight on recording instead, rather than making the user
        // press a button that just failed.
        if (BACKEND_FAILURES.has(e.error)) {
          stoppedByUser.current = true
          teardown(rec)
          recognition.current = null
          rememberFallback()
          forceRecord()
          void startRecording()
          return
        }

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
          committedRef.current = collapseRepeats(join(committedRef.current, sessionRef.current))
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
  }, [teardown, startRecording, forceRecord])

  // ── the two-mode surface ─────────────────────────────────

  const start = useCallback(() => {
    setError(null)
    stoppedByUser.current = false
    committedRef.current = ''
    sessionRef.current = ''
    setFinalText('')
    setInterimText('')

    if (capability === 'live' && !forcedRef.current) startLive()
    else void startRecording()
  }, [capability, startLive, startRecording])

  const stop = useCallback(() => {
    stoppedByUser.current = true
    if (capability !== 'live' || forcedRef.current) {
      // `onstop` clears `listening` once the clip is assembled.
      recorderRef.current?.stop()
      return
    }
    recognition.current?.stop()
    setListening(false)
  }, [capability])

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
    const recorder = recorderRef
    return () => {
      stoppedByUser.current = true
      const rec = current.current
      if (rec) { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort() }
      const active = recorder.current
      if (active) {
        active.ondataavailable = null
        active.onstop = null
        if (active.state !== 'inactive') active.stop()
        active.stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  return {
    supported,
    listening,
    transcript: collapseRepeats(mergeSpeech(finalText, interimText)),
    error,
    mode,
    transcribing,
    start,
    stop,
    reset,
  }
}
