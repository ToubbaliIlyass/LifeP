import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { recordUsage } from '@/lib/ai/usage'

/**
 * Dictation for browsers that cannot do it themselves.
 *
 * The live path (SpeechRecognition, see src/lib/useSpeechInput.ts) is still
 * preferred where it works, because words appear while you speak. But it is
 * not available everywhere:
 *
 *   Brave    ships `webkitSpeechRecognition` for fingerprinting parity and
 *            then strips the Google speech backend, so it exists, reports
 *            itself supported, and fails with a `network` error on start.
 *   Firefox  does not implement it at all.
 *   Safari   implements it, patchily.
 *
 * So the client falls back to recording the clip and posting it here. That
 * costs a round trip at the end instead of streaming, which is a far better
 * trade than a microphone button that does nothing.
 */

/** ~8MB — several minutes of Opus, and well inside the transcription API's 25MB. */
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'Dictation is not configured on this server.' }, { status: 503 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('audio')
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'No audio received.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'That recording is too long.' }, { status: 413 })
  }

  // The browser's own language, so "deux heures" is not heard as English.
  // Whisper's `language` wants the bare code, not the region.
  const locale = form?.get('language')
  const language = typeof locale === 'string' ? locale.slice(0, 2).toLowerCase() : undefined

  try {
    const { text, durationInSeconds } = await transcribe({
      model: openai.transcription('gpt-4o-mini-transcribe'),
      audio: new Uint8Array(await file.arrayBuffer()),
      ...(language && /^[a-z]{2}$/.test(language) ? { providerOptions: { openai: { language } } } : {}),
    })
    // Billed by the minute; if the length is unknown, the size of the clip stands in for it (~16 KB a second of Opus).
    void recordUsage(user.id, { seconds: durationInSeconds ?? file.size / 16_000 }, 'dictation')
    return Response.json({ text: text.trim() })
  } catch {
    return Response.json({ error: 'Could not make out that recording.' }, { status: 502 })
  }
}
