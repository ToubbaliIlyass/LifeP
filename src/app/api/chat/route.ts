import { convertToModelMessages, streamText } from 'ai'
import { defaultModel } from '@/lib/ai/client'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { logger } from '@/lib/log'

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json({ error: 'API key not configured' }, { status: 503 })
  }

  const { messages } = await request.json()

  const result = streamText({
    model: defaultModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    onFinish({ usage }) {
      logger.info('chat_completion', {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    },
  })

  return result.toUIMessageStreamResponse()
}
