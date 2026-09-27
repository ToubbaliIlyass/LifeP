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
import { daysLabel } from '@/lib/days'
import { logger } from '@/lib/log'
import { clockIn, zoneFor } from '@/lib/clock'
import { fromMinutes } from '@/lib/schedule'

// Only the tail of the conversation is resent each turn. Older turns are
// dropped rather than re-billed — the graph snapshot carries the durable state.
const MAX_HISTORY_MESSAGES = 16

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
  const clock = clockIn(zoneFor(request.headers.get('x-time-zone'), settings.timeZone))
  const weekday = new Date(clock.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })
  const dateContext = `\n\n## Current date\nToday is ${weekday} ${clock.date}, and it is ${fromMinutes(clock.minutes)} where the user is. Always use this exact date for "today". Derive "tomorrow", "next week", etc. from this date. Never use dates from your training data as defaults.`

  const availabilitySummary = availability.summary()

  /*
   * The parts the user has cut their day into. Without these the model can
   * only set `dayPart` by guessing an id, so it never set one at all — and a
   * sixteen-hour day went on being treated as one interchangeable stretch.
   */
  const parts = (settings.dayParts ?? []).filter((p) => p.name)
  const dayPartContext =
    parts.length > 0
      ? '\n\n## Parts of the user\'s day\n' +
        'Set `dayPart` on a Task or Habit to one of these ids when it clearly belongs to that part of the day; leave it out when it does not matter. Anything with a dayPart is only ever planned inside it.\n' +
        parts
          .map((p) => {
            const days = p.days?.length && p.days.length < 7 ? `, ${daysLabel(p.days)} only` : ''
            return `- ${p.id} — ${p.name} (${p.start}–${p.end}${days})`
          })
          .join('\n')
      : ''

  const personalContext =
    (memories ? `\n\n${memories}` : '') +
    (availabilitySummary ? `\n\n${availabilitySummary}` : '') +
    dayPartContext

  const history = dropOldAttachments(messages.slice(-MAX_HISTORY_MESSAGES))

  const result = streamText({
    model: defaultModel,
    // Static text first (prompt, then enabled modules) so the prefix stays cacheable across turns.
    system: SYSTEM_PROMPT + moduleContext + dateContext + personalContext + graphContext + rejectionContext,
    messages: await convertToModelMessages(history),
    tools: buildTools(user, settings, { clock, directTasks: true }),
    // Room for the whole loop in one turn: add what was said, plan the day,
    // read it back.
    stopWhen: stepCountIs(8),
    onFinish({ usage }) {
      logger.info('chat_completion', {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        historyMessages: history.length,
        snapshotChars: graphContext.length,
        memoryChars: personalContext.length,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
