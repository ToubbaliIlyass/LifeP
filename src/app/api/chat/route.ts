import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { defaultModel } from '@/lib/ai/client'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { buildTools } from '@/lib/ai/tools'
import { buildContextSnapshot } from '@/lib/ai/context'
import { getRecentRejections } from '@/lib/db/proposals'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/log'
import { todayStr } from '@/lib/date'

// Only the tail of the conversation is resent each turn. Older turns are
// dropped rather than re-billed — the graph snapshot carries the durable state.
const MAX_HISTORY_MESSAGES = 16

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 503 },
    )
  }

  const user = await getCurrentUser()

  if (!user) return unauthorized()
  const { messages } = await request.json()

  // Extract the last user message for keyword-based snapshot filtering
  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const userText =
    typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? (lastUserMsg.content as { type: string; text?: string }[])
            .filter((p) => p.type === 'text')
            .map((p) => p.text ?? '')
            .join(' ')
        : ''

  const graphContext = await buildContextSnapshot(user.id, userText)

  // Append recent rejection context so the AI learns from them. Only the
  // headline of each rejected proposal — the reasoning body is not worth resending.
  const rejections = await getRecentRejections(user.id, 3)
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

  const today = todayStr()
  const dateContext = `\n\n## Current date\nToday is ${today}. Always use this exact date for "today". Derive "tomorrow", "next week", etc. from this date. Never use dates from your training data as defaults.`

  const history = messages.slice(-MAX_HISTORY_MESSAGES)

  const result = streamText({
    model: defaultModel,
    // SYSTEM_PROMPT stays first so the static prefix stays cacheable across turns.
    system: SYSTEM_PROMPT + dateContext + graphContext + rejectionContext,
    messages: await convertToModelMessages(history),
    tools: buildTools(user),
    stopWhen: stepCountIs(5),
    onFinish({ usage }) {
      logger.info('chat_completion', {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        historyMessages: history.length,
        snapshotChars: graphContext.length,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
