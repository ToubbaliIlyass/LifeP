import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { defaultModel } from '@/lib/ai/client'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { buildTools } from '@/lib/ai/tools'
import { modulePrompts } from '@/lib/modules'
import type { Settings } from '@/lib/settings'
import { buildContextSnapshot } from '@/lib/ai/context'
import { getRecentRejections } from '@/lib/db/proposals'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { getNodes } from '@/lib/graph/queries'
import { memoryContext } from '@/lib/memory'
import { loadAvailability } from '@/lib/availability'
import { logger } from '@/lib/log'
import { clockIn, zoneFor } from '@/lib/clock'
import { fromMinutes } from '@/lib/schedule'
import { recordUsage } from '@/lib/ai/usage'

// Only the tail of the conversation is resent each turn. Older turns are
// dropped rather than re-billed — the graph snapshot carries the durable state.
const MAX_HISTORY_MESSAGES = 10

/*
 * Attachments ride along with the message they were sent with, and no further.
 * The assistant has already read them and written down what mattered; sending
 * a PDF again on every later turn would re-bill the whole document each time.
 */
function dropOldAttachments(history: UIMessage[]): UIMessage[] {
  const lastUser = history.map((m) => m.role).lastIndexOf('user')
  return history.map((m, i) =>
    i === lastUser
      ? m
      : {
          ...m,
          parts: m.parts.map((p) =>
            p.type === 'file'
              ? { type: 'text' as const, text: `[Earlier attachment "${p.filename ?? 'file'}" — already read, not re-sent]` }
              : p,
          ),
        },
  )
}

/*
 * What a tool returned is read once, in the turn it was returned in; the
 * answer the assistant wrote from it is what the later turns need. Resending
 * every old result (a whole day's plan, a page of search hits) on each
 * message was most of a long conversation's bill.
 */
function dropOldToolResults(history: UIMessage[]): UIMessage[] {
  const lastUser = history.map((m) => m.role).lastIndexOf('user')
  return history.map((m, i) =>
    i < lastUser
      ? {
          ...m,
          parts: m.parts.map((p) =>
            p.type.startsWith('tool-') && 'output' in p && p.output !== undefined
              ? ({ ...p, output: 'Done — the result is no longer needed.' } as typeof p)
              : p,
          ),
        }
      : m,
  )
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 503 },
    )
  }

  const user = await getCurrentUser()

  if (!user) return unauthorized()
  const { messages } = (await request.json()) as { messages: UIMessage[] }

  // Extract the last user message for keyword-based snapshot filtering
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const userText = (lastUserMsg?.parts ?? [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')

  const [graphContext, rejections, memories, availability, settingsNodes] = await Promise.all([
    buildContextSnapshot(user.id, userText),
    // Append recent rejection context so the AI learns from them. Only the
    // headline of each rejected proposal — the reasoning body is not worth resending.
    getRecentRejections(user.id, 3),
    memoryContext(user.id),
    loadAvailability(user.id),
    getNodes(user.id, { type: 'Settings' }),
  ])

  const rejectionContext =
    rejections.length > 0
      ? '\n\n## Recently rejected (do not repeat)\n' +
        rejections
          .map(
            (r) =>
              `- "${r.summary.split('\n')[0]}"${r.rejectionReason ? ` — ${r.rejectionReason}` : ''}`,
          )
          .join('\n')
      : ''

  // Modules the user has switched off are not even described to the model,
  // so it cannot start filing things into a section they never see.
  const settings = (settingsNodes[0]?.properties ?? {}) as Partial<Settings>
  // Every enabled module's own prompt section, and nothing from the others:
  // a module that is off is never described, so its types cannot be invented.
  const moduleContext = modulePrompts(settings)

  // The user's clock, from the zone their browser sends — the server's own
  // is UTC once deployed, which put "today" on the wrong day near midnight.
  const clock = clockIn(zoneFor(request.headers.get('x-time-zone'), settings.timeZone, settings.timeZoneOverride))
  const weekday = new Date(clock.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
  const dateContext = `\n\n## Current date\nToday is ${weekday} ${clock.date}, and it is ${fromMinutes(clock.minutes)} where the user is. Always use this exact date for "today". Derive "tomorrow", "next week", etc. from this date. Never use dates from your training data as defaults.`

  const availabilitySummary = availability.summary()

  const personalContext =
    (memories ? `\n\n${memories}` : '') +
    (availabilitySummary ? `\n\n${availabilitySummary}` : '')

  const history = dropOldToolResults(dropOldAttachments(messages.slice(-MAX_HISTORY_MESSAGES)))

  const result = streamText({
    model: defaultModel,
    /*
     * Most stable first, most changeable last. The provider caches the longest
     * unchanged start of a request at a fraction of the price, and the date
     * line carries the minute — so it goes at the very end, where changing
     * it spoils nothing before it.
     */
    system: SYSTEM_PROMPT + moduleContext + personalContext + graphContext + rejectionContext + dateContext,
    // One user's requests share a cache, so the stable start is found again.
    providerOptions: { openai: { promptCacheKey: `acture-${user.id}` } },
    maxOutputTokens: 2000,
    messages: await convertToModelMessages(history),
    tools: buildTools(user, settings, { clock, directTasks: true }),
    // Room for the whole loop in one turn: add what was said, plan the day,
    // read it back.
    stopWhen: stepCountIs(6),
    onFinish({ usage, totalUsage }) {
      // The whole turn, every step of it, not just the last.
      const spent = totalUsage ?? usage
      void recordUsage(user.id, spent, 'chat', clock.date)
      logger.info('chat_completion', {
        inputTokens: spent.inputTokens,
        cachedInputTokens: spent.cachedInputTokens,
        outputTokens: spent.outputTokens,
        historyMessages: history.length,
        snapshotChars: graphContext.length,
        memoryChars: personalContext.length,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
