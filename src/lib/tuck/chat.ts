/**
 * Which Tuck goes with where the conversation is.
 *
 * The assistant works in steps the screen used to show as three bouncing
 * dots: it looks at what was handed over, thinks, digs through what it
 * knows, plans a slot, writes the answer. Each of those is a pose. Read from
 * the messages themselves, so it is never a guess about the server.
 */

import type { UIMessage } from 'ai'
import type { TuckState } from './states'

type Part = UIMessage['parts'][number]
type ToolLike = { type: string; state: string; input?: unknown; output?: unknown }

const isTool = (p: Part): p is Part & ToolLike => p.type.startsWith('tool-') || p.type === 'dynamic-tool'
const nameOf = (p: ToolLike) => (p.type.startsWith('tool-') ? p.type.slice(5) : 'unknown')
const finished = (p: ToolLike) => p.state === 'output-available'

const READS = ['readGraph', 'searchNodes', 'getNodeDetail']
const PROPOSALS = ['batchPropose', 'deleteNode', 'proposeNodeType']
const WRITES = ['createNode', 'updateNodeProperties', 'createEdge', 'planDay']

/** Tuck while the assistant is at work: what it is doing right now. */
export function workingPose(messages: UIMessage[]): TuckState {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  const asked = messages[lastUser]
  const reply = messages.slice(lastUser + 1).find((m) => m.role === 'assistant')
  const last = reply?.parts[reply.parts.length - 1]

  // Nothing back yet: reading what was handed over, or thinking about what was said.
  if (!last) return asked?.parts.some((p) => p.type === 'file') ? 'looking' : 'thinking'

  if (last.type === 'text') return last.text.length > 0 ? 'replying' : 'thinking'
  if (!isTool(last)) return 'thinking'

  const name = nameOf(last)
  if (!finished(last)) {
    if (READS.includes(name)) return 'digging'
    if (name === 'getDay') return 'looking'
    if (name === 'planDay') return 'planning'
    if (PROPOSALS.includes(name)) return 'proposing'
    return 'thinking'
  }
  // Just finished, and the reply has not started: what it found.
  if (name === 'createEdge') return 'found'
  if (READS.includes(name)) {
    const out = last.output as { count?: number; nodes?: unknown[] } | undefined
    return (out?.count ?? out?.nodes?.length ?? 0) > 0 ? 'found' : 'thinking'
  }
  return 'thinking'
}

/** Tuck for a few seconds after the reply: "done", or an explanation of the plan. Null when there is nothing to add. */
export function afterPose(messages: UIMessage[]): TuckState | null {
  const reply = [...messages].reverse().find((m) => m.role === 'assistant')
  const tools = (reply?.parts ?? []).filter(isTool)
  const plan = tools.find((p) => nameOf(p) === 'planDay' && finished(p))
  if (plan && ((plan.output as { planned?: unknown[] } | undefined)?.planned?.length ?? 0) > 0) return 'explaining'
  if (tools.some((p) => WRITES.includes(nameOf(p)) && finished(p))) return 'confirmed'
  return null
}
