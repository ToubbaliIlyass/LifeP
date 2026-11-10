import { getEdges, getNodes } from '@/lib/graph/queries'
import { buildTodos } from '@/lib/todos'
import type { OrgSnapshot } from '@/lib/reorganise'

/** The lists and to-dos as the app shows them, and every link between the two, for rearranging. */
export async function organisationSnapshot(userId: number, today: string): Promise<OrgSnapshot & { tags: Map<number, string[]>; due: Map<number, string | null> }> {
  const [nodes, edges] = await Promise.all([getNodes(userId), getEdges(userId)])
  const { todos, lists } = buildTodos({ date: today, nodes, edges })
  const listIds = new Set(lists.map((l) => l.id))
  const todoIds = new Set(todos.filter((t) => t.id > 0).map((t) => t.id))
  const listEdges = edges
    .filter((e) => e.type !== 'scheduled-for')
    .flatMap((e) => {
      if (todoIds.has(e.sourceId) && listIds.has(e.targetId)) return [{ sourceId: e.sourceId, targetId: e.targetId, type: e.type, todoId: e.sourceId, listId: e.targetId }]
      if (todoIds.has(e.targetId) && listIds.has(e.sourceId)) return [{ sourceId: e.sourceId, targetId: e.targetId, type: e.type, todoId: e.targetId, listId: e.sourceId }]
      return []
    })
  const children = edges
    .filter((e) => e.type === 'part-of' && listIds.has(e.targetId))
    .map((e) => ({ childId: e.sourceId, listId: e.targetId, type: e.type }))
  return {
    children,
    todos: todos.filter((t) => !t.prayerKey).map((t) => ({ id: t.id, title: t.title, type: t.type, done: t.done, listId: t.listId })),
    lists: lists.filter((l) => !l.done).map((l) => ({ id: l.id, title: l.title, kind: l.kind, areaId: l.areaId })),
    listEdges,
    tags: new Map(todos.map((t) => [t.id, t.tags])),
    due: new Map(todos.map((t) => [t.id, t.when])),
  }
}
