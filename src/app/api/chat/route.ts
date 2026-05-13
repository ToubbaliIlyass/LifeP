import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { defaultModel } from '@/lib/ai/client'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { buildTools } from '@/lib/ai/tools'
import { buildContextSnapshot } from '@/lib/ai/context'
import { getRecentRejections } from '@/lib/db/proposals'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/log'

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json({ error: 'API key not configured' }, { status: 503 })
  }

  const user = getCurrentUser()
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

  const graphContext = buildContextSnapshot(user.id, userText)

  // Append recent rejection context so the AI learns from them
  const rejections = getRecentRejections(user.id)
  const rejectionContext =
    rejections.length > 0
      ? '\n\n## Recent rejected proposals (learn from these)\n' +
        rejections
          .map(
            (r) =>
              `- "${r.summary}" was rejected${r.rejectionReason ? `: "${r.rejectionReason}"` : ' (no reason given)'}`,
          )
          .join('\n')
      : ''

  const today = new Date().toISOString().split('T')[0]
  const dateContext = `\n\n## Current date\nToday is ${today}. Always use this exact date for "today". Derive "tomorrow", "next week", etc. from this date. Never use dates from your training data as defaults.`

  const result = streamText({
    model: defaultModel,
    system: SYSTEM_PROMPT + dateContext + graphContext + rejectionContext,
    messages: await convertToModelMessages(messages),
    tools: buildTools(),
    stopWhen: stepCountIs(8),
    onFinish({ usage }) {
      logger.info('chat_completion', {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
