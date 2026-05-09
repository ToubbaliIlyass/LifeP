import { google } from '@ai-sdk/google'

// Swap the model string here to change providers without touching call sites.
// Alternatives: openai('gpt-4o-mini'), anthropic('claude-haiku-4-5')
export const defaultModel = google('gemini-2.0-flash')
