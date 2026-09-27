import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { defaultModel } from '@/lib/ai/client'
import { createProposal } from '@/lib/db/proposals'
import { getSchemaVersion } from '@/lib/db/node-types'
import { readSettings } from '@/lib/settings'
import { hiddenTypes, enabledModules } from '@/lib/modules'
import { todayStr } from '@/lib/date'
import type { BatchOperation } from '@/lib/ai/tools'

/**
 * The last step of setup: everything the forms had no box for.
 *
 * The forms take what has a shape — modules, hours, commitments, habits — and
 * a person's life always has more than that in it. Rather than inventing a
 * field for every possibility, the rest is written in plain words and turned
 * into nodes here.
 *
 * It becomes a proposal, not rows in the database. This is the one moment the
 * user has no feel yet for what the app does with what they say, so the first
 * thing it does should be to show them and ask — a setup step that silently
 * created fifteen things would teach exactly the wrong lesson about who is in
 * charge here.
 */

const Extracted = z.object({
  goals: z.array(z.object({ name: z.string(), targetDate: z.string().nullable() })).max(8),
  projects: z.array(z.object({ name: z.string(), supportsGoal: z.string().nullable() })).max(8),
  tasks: z.array(z.object({ name: z.string(), dueDate: z.string().nullable(), partOfProject: z.string().nullable() })).max(15),
  notes: z.array(z.object({ title: z.string(), content: z.string() })).max(5),
})

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'No AI key configured' }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as { text?: string }
  const text = (body.text ?? '').trim()
  if (text.length < 10) return Response.json({ ok: true, proposed: false })

  const settings = await readSettings(user.id)
  const off = hiddenTypes(settings)
  const sections = enabledModules(settings).map((m) => m.label).join(', ')

  const { output } = await generateText({
    model: defaultModel,
    system: [
      'The user is setting up a life planner and has written whatever else they want it to know.',
      'Pull out only what they actually said. Do not invent goals they did not mention, do not turn one sentence into five tasks, and leave a list empty rather than filling it.',
      'A goal is something they are working towards. A project is a body of work. A task is one thing to do. Anything else worth keeping is a note.',
      `Today is ${todayStr()}. Use it for any relative date, and YYYY-MM-DD for dates.`,
      sections ? `Sections this user has switched on: ${sections}.` : '',
      off.size ? `They do NOT use: ${[...off].join(', ')}. Never produce anything of those kinds.` : '',
    ].filter(Boolean).join('\n'),
    prompt: text,
    output: Output.object({ schema: Extracted }),
  })

  // Built in this order so "$N" references stay stable: goals, then projects,
  // then tasks, then notes — each referring only backwards.
  const operations: BatchOperation[] = []
  const indexOf = new Map<string, number>()
  const push = (type: string, properties: Record<string, unknown>, key?: string) => {
    if (key) indexOf.set(key.toLowerCase(), operations.filter((o) => o.kind === 'createNode').length)
    operations.push({ kind: 'createNode', type, properties })
  }

  for (const g of output.goals) {
    if (!g.name?.trim()) continue
    push('Goal', { name: g.name.trim(), status: 'active', ...(g.targetDate ? { targetDate: g.targetDate } : {}) }, g.name)
  }
  for (const p of output.projects) {
    if (!p.name?.trim()) continue
    push('Project', { name: p.name.trim(), status: 'active' }, p.name)
    const goal = p.supportsGoal ? indexOf.get(p.supportsGoal.toLowerCase()) : undefined
    if (goal !== undefined) {
      operations.push({
        kind: 'createEdge',
        sourceRef: `$${operations.filter((o) => o.kind === 'createNode').length - 1}`,
        targetRef: `$${goal}`,
        type: 'supports',
      })
    }
  }
  for (const t of output.tasks) {
    if (!t.name?.trim()) continue
    push('Task', { name: t.name.trim(), status: 'todo', priority: 'medium', ...(t.dueDate ? { dueDate: t.dueDate } : {}) })
    const project = t.partOfProject ? indexOf.get(t.partOfProject.toLowerCase()) : undefined
    if (project !== undefined) {
      operations.push({
        kind: 'createEdge',
        sourceRef: `$${operations.filter((o) => o.kind === 'createNode').length - 1}`,
        targetRef: `$${project}`,
        type: 'part-of',
      })
    }
  }
  for (const n of output.notes) {
    if (!n.title?.trim()) continue
    push('Note', { title: n.title.trim(), content: n.content ?? '' })
  }

  if (operations.length === 0) return Response.json({ ok: true, proposed: false })

  const counts = [
    output.goals.length && `${output.goals.length} goal${output.goals.length > 1 ? 's' : ''}`,
    output.projects.length && `${output.projects.length} project${output.projects.length > 1 ? 's' : ''}`,
    output.tasks.length && `${output.tasks.length} task${output.tasks.length > 1 ? 's' : ''}`,
    output.notes.length && `${output.notes.length} note${output.notes.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')

  const proposal = await createProposal(
    user.id,
    `From your setup notes: ${counts}\n\nEverything here came from what you wrote when setting up. Approve what fits and reject the rest.`,
    operations,
    await getSchemaVersion(user.id),
  )

  return Response.json({ ok: true, proposed: true, proposalId: proposal.id, count: operations.length })
}
