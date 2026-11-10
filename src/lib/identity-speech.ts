/**
 * Who someone said they are becoming, read without a model: the fallback
 * when the AI is off or unreachable, so speaking still gets them somewhere.
 *
 * "I want to be a runner and someone who writes" -> ["a runner", "someone who writes"]
 */
export function fallbackIdentities(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  const lead = /\b(?:i(?:['’]m| am)? (?:want|wanna|would like|hope|am trying|’m trying|'m trying)(?: to)? (?:be(?:come)?|become)|i(?:['’]m| am) becoming|i want to be|become|becoming)\s+/i
  const m = lead.exec(clean)
  const rest = (m ? clean.slice(m.index + m[0].length) : clean).replace(/[.!?]+$/, '')
  if (!rest) return []
  return rest
    .split(/\s*(?:,|;|\band also\b|\band\b(?= (?:a|an|someone|somebody|more|less|calm|the)\b))\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
}
