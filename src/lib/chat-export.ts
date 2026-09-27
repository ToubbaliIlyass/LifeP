import { strFromU8, unzipSync } from 'fflate'

/**
 * Reads a ChatGPT or Claude data export in the browser.
 *
 * Exports run to hundreds of megabytes and are mostly the assistant's own
 * replies, which say nothing about the user. So the file never leaves the
 * device whole: it is unpacked here, reduced to the user's own messages,
 * newest conversations first, and cut to a fixed budget before anything is
 * uploaded.
 *
 *   ChatGPT  Settings → Data controls → Export data  →  zip with conversations.json
 *            [{ title, create_time, mapping: { id: { message: { author: { role }, content: { parts } } } } }]
 *   Claude   Settings → Privacy → Export data         →  zip with conversations.json
 *            [{ name, created_at, chat_messages: [{ sender: 'human' | 'assistant', text, content }] }]
 */

export type ExportSource = 'chatgpt' | 'claude'

export interface ParsedConversation {
  title: string
  date: string
  messages: string[]
}

export interface ParsedExport {
  source: ExportSource
  conversations: ParsedConversation[]
}

export async function readExportFile(file: File): Promise<ParsedExport> {
  let json: string
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // Only conversations.json is decompressed; the rest of the archive
    // (images, audio, other JSON) is skipped without being inflated.
    const entries = unzipSync(bytes, { filter: (f) => /(^|\/)conversations\.json$/i.test(f.name) })
    const key = Object.keys(entries)[0]
    if (!key) throw new Error('This zip has no conversations.json. Is it a ChatGPT or Claude export?')
    json = strFromU8(entries[key])
  } else {
    json = await file.text()
  }

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  return parseConversations(data)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null

function isoDay(value: unknown): string {
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

export function parseConversations(data: unknown): ParsedExport {
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.conversations) ? data.conversations : null
  if (!list || list.length === 0) throw new Error('No conversations found in this file.')

  const first = list.find(isObj)
  if (first && 'mapping' in first) {
    return {
      source: 'chatgpt',
      conversations: list.filter(isObj).map((c) => {
        const nodes = isObj(c.mapping) ? Object.values(c.mapping) : []
        const messages = nodes
          .map((n) => (isObj(n) && isObj(n.message) ? n.message : null))
          .filter((m): m is Obj => !!m && isObj(m.author) && m.author.role === 'user')
          .sort((a, b) => Number(a.create_time ?? 0) - Number(b.create_time ?? 0))
          .map((m) => {
            const parts = isObj(m.content) && Array.isArray(m.content.parts) ? m.content.parts : []
            return parts.filter((p): p is string => typeof p === 'string').join('\n')
          })
        return { title: String(c.title ?? 'Untitled'), date: isoDay(c.create_time), messages }
      }),
    }
  }

  if (first && 'chat_messages' in first) {
    return {
      source: 'claude',
      conversations: list.filter(isObj).map((c) => {
        const messages = (Array.isArray(c.chat_messages) ? c.chat_messages : [])
          .filter((m): m is Obj => isObj(m) && m.sender === 'human')
          .map((m) => {
            if (typeof m.text === 'string' && m.text) return m.text
            const content = Array.isArray(m.content) ? m.content : []
            return content.map((p) => (isObj(p) && typeof p.text === 'string' ? p.text : '')).join('\n')
          })
        return { title: String(c.name ?? 'Untitled'), date: isoDay(c.created_at), messages }
      }),
    }
  }

  throw new Error('This does not look like a ChatGPT or Claude export.')
}

/** Per message: long pastes (code, documents) are rarely about the person. */
const MESSAGE_CHARS = 500
/** Messages this short ("thanks", "continue") carry nothing. */
const MIN_MESSAGE_CHARS = 15

export function buildDigest(parsed: ParsedExport, maxChars = 80_000) {
  const ordered = [...parsed.conversations].sort((a, b) => b.date.localeCompare(a.date))
  const sections: string[] = []
  let size = 0
  let used = 0
  for (const c of ordered) {
    const lines = c.messages
      .map((m) => m.replace(/\s+/g, ' ').trim())
      .filter((m) => m.length >= MIN_MESSAGE_CHARS)
      .map((m) => `- ${m.slice(0, MESSAGE_CHARS)}`)
    if (lines.length === 0) continue
    const section = `### ${c.title} (${c.date || 'undated'})\n${lines.join('\n')}`
    if (size + section.length > maxChars) break
    sections.push(section)
    size += section.length + 1
    used++
  }
  return { text: sections.join('\n'), conversationsUsed: used, totalConversations: parsed.conversations.length }
}
