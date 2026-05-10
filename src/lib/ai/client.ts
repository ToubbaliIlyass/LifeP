import { openai } from '@ai-sdk/openai'

// Swap the model string here to change providers without touching call sites.
export const defaultModel = openai('gpt-4o-mini')
