import { z } from 'zod'
import type { CurrentUser } from '@/lib/auth/getCurrentUser'
import { buildTools } from '@/lib/ai/tools'
import { readSettings } from '@/lib/settings'
import { getEdges, getNodes } from '@/lib/graph/queries'
import { eventOccursOn, isDueOn, todayStr } from '@/lib/date'
import { listMemories } from '@/lib/memory'
import { loadAvailability } from '@/lib/availability'

/**
 * What an outside chatbot can do in Acture.
 *
 * Mostly the in-app assistant's own tools, so both obey the same rules —
 * above all that Goals, Tasks, Habits, Events and the like arrive as
 * PROPOSALS the user approves in Acture, never as silent writes. A chatbot
 * someone connected last month should not be able to restructure their life
 * without them seeing it.
 */

export interface McpTool {
  name: string
  description: string
  schema: z.ZodType
  run: (args: unknown) => Promise<unknown>
}

type AiTool = { description?: string; inputSchema: unknown; execute?: (input: unknown, options: { toolCallId: string; messages: [] }) => unknown }

/** Where the in-app wording ("the snapshot in your context") would mislead an outside client. */
const DESCRIPTION_OVERRIDES: Record<string, string> = {
  readGraph:
    'List items in the user\'s Acture life graph (goals, projects, habits, tasks, events, notes…) with ids. Pass filter "type:Goal" etc. to narrow. Prefer searchNodes when looking for something by name.',
  createNode:
    'Create a lightweight item immediately: Note { title, content }, HabitLog { habitNodeId, date, completed }, and the direct types of whichever optional sections this user has enabled. Goals, Habits, Tasks, Projects and Events must go through batchPropose instead; anything belonging to a section the user has switched off is refused.',
}

const EXPOSED = [
  'readGraph', 'searchNodes', 'getNodeDetail', 'createNode', 'createEdge',
  'updateNodeProperties', 'deleteNode', 'batchPropose', 'remember', 'rememberAvailability', 'logActivity', 'forget',
] as const

function nameOf(p: Record<string, unknown>, fallback: string) {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : fallback
}

export async function buildMcpTools(user: CurrentUser): Promise<McpTool[]> {
  // The same module gate the in-app assistant gets. Without it an outside
  // chatbot could create content pieces in an app with no content hub.
  const settings = await readSettings(user.id)
  const chat = buildTools(user, settings) as unknown as Record<string, AiTool>

  const wrapped: McpTool[] = EXPOSED.map((name) => {
    const t = chat[name]
    return {
      name,
      description: DESCRIPTION_OVERRIDES[name] ?? t.description ?? name,
      schema: t.inputSchema as z.ZodType,
      run: async (args) => t.execute!(args, { toolCallId: `mcp-${name}`, messages: [] }),
    }
  })

  const getToday: McpTool = {
    name: 'getToday',
    description:
      'Start here. The user\'s day in Acture: tasks due or overdue, habits due and whether they are done, events, what is already on the calendar, plus active goals. Optional date (YYYY-MM-DD) for another day.',
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    run: async (args) => {
      const date = (args as { date?: string }).date ?? todayStr()
      const dow = new Date(date + 'T00:00:00').getDay()
      const [tasks, habits, logs, events, blocks, goals, edges] = await Promise.all([
        getNodes(user.id, { type: 'Task' }),
        getNodes(user.id, { type: 'Habit' }),
        getNodes(user.id, { type: 'HabitLog' }),
        getNodes(user.id, { type: 'Event' }),
        getNodes(user.id, { type: 'TimeBlock' }),
        getNodes(user.id, { type: 'Goal' }),
        getEdges(user.id, { type: 'scheduled-for' }),
      ])
      const names = new Map([...tasks, ...habits].map((n) => [n.id, nameOf(n.properties as Record<string, unknown>, `#${n.id}`)]))
      const p = (n: { properties: unknown }) => n.properties as Record<string, unknown>

      return {
        date,
        tasks: tasks
          .filter((t) => p(t).status !== 'done' && typeof p(t).dueDate === 'string' && (p(t).dueDate as string) <= date)
          .map((t) => ({ id: t.id, name: nameOf(p(t), `Task #${t.id}`), dueDate: p(t).dueDate, priority: p(t).priority ?? 'medium' })),
        habits: habits
          .filter((h) => isDueOn(String(p(h).frequency ?? 'daily'), Array.isArray(p(h).daysOfWeek) ? (p(h).daysOfWeek as number[]) : null, dow))
          .map((h) => ({
            id: h.id,
            name: nameOf(p(h), `Habit #${h.id}`),
            done: logs.some((l) => p(l).habitNodeId === h.id && p(l).date === date && p(l).completed === true),
          })),
        events: events
          .filter((e) => eventOccursOn({
            date: typeof p(e).date === 'string' ? (p(e).date as string) : null,
            frequency: typeof p(e).frequency === 'string' ? (p(e).frequency as string) : null,
            daysOfWeek: Array.isArray(p(e).daysOfWeek) ? (p(e).daysOfWeek as number[]) : null,
            until: typeof p(e).until === 'string' ? (p(e).until as string) : null,
          }, date))
          .map((e) => ({ id: e.id, name: nameOf(p(e), `Event #${e.id}`), time: p(e).time ?? null, duration: p(e).duration ?? null })),
        calendar: blocks
          .filter((b) => p(b).date === date)
          .map((b) => {
            const target = edges.find((e) => e.sourceId === b.id)?.targetId
            return { start: p(b).startTime, end: p(b).endTime, for: target ? names.get(target) ?? `#${target}` : null }
          })
          .sort((a, b) => String(a.start).localeCompare(String(b.start))),
        activeGoals: goals
          .filter((g) => (p(g).status ?? 'active') === 'active')
          .map((g) => ({ id: g.id, name: nameOf(p(g), `Goal #${g.id}`), targetDate: p(g).targetDate ?? null })),
      }
    },
  }

  const getMemory: McpTool = {
    name: 'getMemory',
    description:
      'What Acture already knows about the user: saved facts (goals, routines, preferences, constraints) and when they are busy, free, or prefer to do things. Check before calling remember so you do not save duplicates.',
    schema: z.object({}),
    run: async () => {
      const [memories, availability] = await Promise.all([listMemories(user.id), loadAvailability(user.id)])
      return {
        memories: memories.map(({ id, text, category, source }) => ({ id, text, category, source })),
        availability: availability.rules,
      }
    },
  }

  return [getToday, getMemory, ...wrapped]
}

export const MCP_INSTRUCTIONS = `Acture is the user's personal life planner: goals, projects, habits, tasks, events, notes and a calendar.
- Call getToday first for the current picture, and getMemory for what is already known about the user.
- Lightweight writes (notes, journal entries, habit logs, status updates) apply immediately.
- New Goals, Habits, Tasks, Projects, Events, Courses, Exams and Assignments must go through batchPropose. They appear in Acture for the user to approve -- tell the user that.
- When the conversation reveals something lasting about the user (a goal, routine, preference, constraint), save it with remember. Use rememberAvailability only for general rules about their week ("I work 9 to 5 on weekdays") -- a named recurring commitment like a shift or a class is a recurring Event via batchPropose instead. Do this quietly.
- When the user says what they did ("went to the gym at 7", "finished the report"), record it with logActivity, one call per activity, passing the Task or Habit nodeId when there is one. This is how Acture learns when things really happen. Do this quietly too.`
