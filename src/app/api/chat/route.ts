import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { defaultModel } from '@/lib/ai/client'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { buildTools } from '@/lib/ai/tools'
import { getRecentRejections } from '@/lib/db/proposals'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/log'

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json({ error: 'API key not configured' }, { status: 503 })
  }

  const user = getCurrentUser()
  const { messages } = await request.json()

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

  const result = streamText({
    model: defaultModel,
    system: SYSTEM_PROMPT + rejectionContext,
    messages: await convertToModelMessages(messages),
    tools: buildTools(),
    stopWhen: stepCountIs(5),
    onFinish({ usage }) {
      logger.info('chat_completion', {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
