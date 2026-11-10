import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileAreas, compilePlan, critiquePlan, planDates, resolvePlanDates, withoutMoves, withoutNodes, type PlanInput } from './plan-compile'

const TODAY = '2026-11-02' // a Monday
const base = (items: PlanInput['items'], extra: Partial<PlanInput> = {}): PlanInput => ({
  intent: 'run a marathon', project: { name: 'Run a marathon' }, items, assumptions: [], ...extra,
})
const ctx = { today: TODAY, areaIds: new Set([7]) }
const created = (ops: ReturnType<typeof compilePlan>['operations']) => ops.filter((o) => o.kind === 'createNode')

test('a plan is a project and its tasks, each task linked to it, and never raw model operations', () => {
  const { operations } = compilePlan(base([{ title: 'Buy shoes', startOffsetDays: 0 }, { title: 'First easy run', startOffsetDays: 2 }]), ctx)
  assert.deepEqual(created(operations).map((o) => (o.kind === 'createNode' ? o.type : '')), ['Project', 'Task', 'Task'])
  const edges = operations.filter((o) => o.kind === 'createEdge')
  assert.equal(edges.length, 2)
  assert.ok(edges.every((e) => e.kind === 'createEdge' && e.targetRef === '$0' && e.type === 'part-of'))
})

test('weekly Mon and Thu becomes daysOfWeek [1,4], starting on the first matching day on or after the start', () => {
  const { operations } = compilePlan(base([{ title: 'Long run', startOffsetDays: 2, repeats: { frequency: 'weekly', days: [4, 1] } }]), ctx)
  const t = created(operations)[1]
  assert.ok(t.kind === 'createNode')
  const p = t.properties as Record<string, unknown>
  assert.deepEqual(p.recurrence, { frequency: 'weekly', daysOfWeek: [1, 4] })
  assert.equal(p.dueDate, '2026-11-05', 'Nov 4 is a Wednesday, so the first Mon/Thu on or after it is Thursday the 5th')
})

test('a repeat that stops is stored as the task’s deadline, never earlier than its first day', () => {
  assert.deepEqual(planDates({ start: 0, frequency: 'daily', until: 30 }, TODAY), { dueDate: '2026-11-02', deadline: '2026-12-02' })
  assert.equal(planDates({ start: 5, frequency: 'daily', until: 1 }, TODAY).deadline, '2026-11-07')
})

test('a weekly repeat with no day is added as a single step, and the user is told', () => {
  const r = compilePlan(base([{ title: 'Stretch', startOffsetDays: 0, repeats: { frequency: 'weekly' } }]), ctx)
  const t = created(r.operations)[1]
  assert.ok(t.kind === 'createNode' && !('recurrence' in t.properties))
  assert.match(r.warnings.join(' '), /no day was given/)
})

test('weekdays snap off a weekend', () => {
  assert.equal(planDates({ start: 5, frequency: 'weekdays' }, TODAY).dueDate, '2026-11-09', 'the 7th is a Saturday')
})

test('two steps with the same title stay two steps', () => {
  const { operations } = compilePlan(base([{ title: 'Long run', startOffsetDays: 0 }, { title: 'Long run', startOffsetDays: 7 }]), ctx)
  assert.equal(created(operations).filter((o) => o.kind === 'createNode' && o.type === 'Task').length, 2)
})

test('more than 25 steps are cut to 25 and it says so; empty titles and bad lengths are repaired', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Step ${i}`, startOffsetDays: i, minutes: i === 0 ? 5000 : undefined }))
  const r = compilePlan(base([{ title: '   ', startOffsetDays: 0 }, ...many]), ctx)
  assert.equal(created(r.operations).filter((o) => o.kind === 'createNode' && o.type === 'Task').length, 25)
  assert.match(r.warnings.join(' '), /first 25/)
  const first = created(r.operations)[1]
  assert.ok(first.kind === 'createNode')
  assert.equal((first.properties as Record<string, unknown>).estimatedMinutes, 480)
})

test('an area that is not theirs is not used; a new one is one new area', () => {
  const stranger = compilePlan(base([{ title: 'x', startOffsetDays: 0 }], { area: { existingId: 999 } }), ctx)
  assert.equal(created(stranger.operations).length, 2)
  assert.match(stranger.warnings.join(' '), /not found/)
  const mine = compilePlan(base([{ title: 'x', startOffsetDays: 0 }], { area: { existingId: 7 } }), ctx)
  const link = mine.operations.find((o) => o.kind === 'createEdge' && o.targetRef === '7')
  assert.ok(link, 'the project is put under their own area by its real id')
  const fresh = compilePlan(base([{ title: 'x', startOffsetDays: 0 }], { area: { name: 'Health' } }), ctx)
  assert.deepEqual(created(fresh.operations).map((o) => (o.kind === 'createNode' ? o.type : '')), ['Goal', 'Project', 'Task'])
})

test('a plan approved days later starts later: dates are worked out again, never in the past', () => {
  const { operations } = compilePlan(base([{ title: 'Buy shoes', startOffsetDays: 0 }, { title: 'Long run', startOffsetDays: 3, repeats: { frequency: 'daily', untilOffsetDays: 10 } }]), ctx)
  const later = resolvePlanDates(operations, '2026-11-05')
  const tasks = later.filter((o) => o.kind === 'createNode' && o.type === 'Task').map((o) => (o.kind === 'createNode' ? o.properties : {}))
  assert.equal(tasks[0].dueDate, '2026-11-05')
  assert.equal(tasks[1].dueDate, '2026-11-08')
  assert.equal(tasks[1].deadline, '2026-11-15')
  // Operations that are not plan tasks are untouched.
  assert.deepEqual(later[0], operations[0])
})

test('unticking a step removes it and its link, and the rest still point at the right things', () => {
  const { operations } = compilePlan(base([{ title: 'A', startOffsetDays: 0 }, { title: 'B', startOffsetDays: 1 }, { title: 'C', startOffsetDays: 2 }]), ctx)
  // created nodes: 0 = project, 1 = A, 2 = B, 3 = C. Drop B.
  const trimmed = withoutNodes(operations, [2])
  const names = trimmed.filter((o) => o.kind === 'createNode').map((o) => (o.kind === 'createNode' ? String(o.properties.name) : ''))
  assert.deepEqual(names, ['Run a marathon', 'A', 'C'])
  const edges = trimmed.filter((o) => o.kind === 'createEdge')
  assert.deepEqual(edges.map((e) => (e.kind === 'createEdge' ? [e.sourceRef, e.targetRef] : [])), [['$1', '$0'], ['$2', '$0']])
  // The project cannot be unticked.
  assert.equal(withoutNodes(operations, [0]).length, operations.length)
})

test('assumptions are shown plainly, without "I assumed" and doubled full stops', () => {
  const r = compilePlan(base([{ title: 'x', startOffsetDays: 0 }], { assumptions: ['I assumed you can run three days a week.', 'a race in May'] }), ctx)
  assert.match(r.summary, /Assumed: you can run three days a week; a race in May\./)
  assert.doesNotMatch(r.summary, /I assumed|\.\./)
})

test('a plan can have phases: headings on the project, and each step sits under its own', () => {
  const r = compilePlan(base([
    { title: 'Buy shoes', startOffsetDays: 0, headingKey: 'prep' },
    { title: 'Long run', startOffsetDays: 3, headingKey: 'build', priority: 'high', checklist: ['Fuel', 'Route', ''] },
    { title: 'Nowhere', startOffsetDays: 4, headingKey: 'missing' },
  ], { headings: [{ key: 'prep', title: 'Get ready' }, { key: 'build', title: 'Build the base' }] }), ctx)
  const [project, a, b, c] = created(r.operations).map((o) => (o.kind === 'createNode' ? o.properties : {}))
  assert.deepEqual(project.headings, [{ id: 'h1', title: 'Get ready' }, { id: 'h2', title: 'Build the base' }])
  assert.equal(a.headingId, 'h1')
  assert.equal(b.headingId, 'h2')
  assert.equal(b.priority, 'high')
  assert.deepEqual(b.checklist, [{ id: 'c1', text: 'Fuel', done: false }, { id: 'c2', text: 'Route', done: false }])
  assert.equal(c.headingId, undefined, 'an unknown phase leaves the step unsectioned')
})

test('no more than three one-off steps land on one day: the rest move on, and it says so', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ title: `Setup ${i}`, startOffsetDays: 0 }))
  const r = compilePlan(base(five), ctx)
  const days = created(r.operations).filter((o) => o.kind === 'createNode' && o.type === 'Task').map((o) => (o.kind === 'createNode' ? o.properties.dueDate : ''))
  assert.deepEqual(days, ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-03', '2026-11-03'])
  assert.match(r.warnings.join(' '), /moved 1 day later/)
})

test('it says when nothing starts soon, and when the first fortnight is heavy', () => {
  assert.match(compilePlan(base([{ title: 'Later', startOffsetDays: 9 }]), ctx).warnings.join(' '), /first two days/)
  const heavy = compilePlan(base([{ title: 'Marathon session', minutes: 240, startOffsetDays: 0, repeats: { frequency: 'daily' } }]), ctx)
  assert.match(heavy.warnings.join(' '), /more than 3 hours/)
})

test('areas of life: new ones are made, with their projects; what exists is never made twice or touched', () => {
  const have = { areas: [{ id: 5, name: 'Health' }], projects: [{ name: 'Gym', areaId: 5 }] }
  const r = compileAreas({
    areas: [
      { name: 'health', projects: [{ name: 'Gym' }, { name: 'Sleep' }] },
      { name: 'Career', projects: [{ name: 'Promotion' }] },
      { name: 'Career' },
    ],
    assumptions: ['I assumed these are the parts that matter now.'],
  }, have)
  assert.deepEqual(r.operations.filter((o) => o.kind === 'createNode').map((o) => (o.kind === 'createNode' ? `${o.type}:${o.properties.name}` : '')), ['Project:Sleep', 'Goal:Career', 'Project:Promotion'])
  const links = r.operations.filter((o) => o.kind === 'createEdge').map((o) => (o.kind === 'createEdge' ? [o.sourceRef, o.targetRef] : []))
  assert.deepEqual(links, [['$0', '5'], ['$2', '$1']], 'Sleep goes under the existing Health by its real id; Promotion under the new Career')
  assert.deepEqual(r.skipped, ['You already have “Health”.', '“Gym” is already under Health.'])
  assert.match(r.summary, /Assumed: these are the parts that matter now\./)
  assert.throws(() => compileAreas({ areas: [{ name: 'Health' }], assumptions: [] }, have), /already there/)
})

test('leaving an area out leaves out everything under it, and the rest is renumbered correctly', () => {
  const r = compileAreas({ areas: [{ name: 'Health', projects: [{ name: 'Gym' }] }, { name: 'Career', projects: [{ name: 'Promotion' }] }], assumptions: [] }, { areas: [], projects: [] })
  // created: 0 Health, 1 Gym, 2 Career, 3 Promotion. Drop Health (0).
  const trimmed = withoutNodes(r.operations, [0])
  assert.deepEqual(trimmed.filter((o) => o.kind === 'createNode').map((o) => (o.kind === 'createNode' ? String(o.properties.name) : '')), ['Career', 'Promotion'])
  assert.deepEqual(trimmed.filter((o) => o.kind === 'createEdge').map((o) => (o.kind === 'createEdge' ? [o.sourceRef, o.targetRef] : [])), [['$1', '$0']])
})

test('unticking a move removes both halves of it and nothing else', () => {
  const tag = (id: number) => ({ id, todoId: 1, todo: 't', from: null, to: 'x' })
  const ops = [
    { kind: 'deleteEdge', sourceRef: '1', targetRef: '2', type: 'part-of', move: tag(0) },
    { kind: 'createEdge', sourceRef: '1', targetRef: '3', type: 'part-of', move: tag(0) },
    { kind: 'createEdge', sourceRef: '4', targetRef: '3', type: 'part-of', move: tag(1) },
  ] as never
  const kept = withoutMoves(ops, [0])
  assert.equal(kept.length, 1)
  assert.equal((kept[0] as { sourceRef: string }).sourceRef, '4')
})

const plan = (items: PlanInput['items'], headings?: PlanInput['headings']) => base(items, { headings })

test('a plan that is all routines is sent back: it needs one-off set-up and a first step', () => {
  const r = { frequency: 'weekly' as const, days: [1] }
  const issues = critiquePlan(plan([1, 2, 3, 4].map((i) => ({ title: `Routine ${i} thing${i}`, startOffsetDays: 0, repeats: r }))))
  assert.ok(issues.some((i) => /Every step repeats/.test(i)))
})

test('nothing soon, and a long plan with no phases, are both sent back', () => {
  const long = Array.from({ length: 9 }, (_, i) => ({ title: `Distinct step ${i} about ${['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'][i]}`, startOffsetDays: 5 + i }))
  const issues = critiquePlan(plan(long))
  assert.ok(issues.some((i) => /within two days/.test(i)))
  assert.ok(issues.some((i) => /no phases/.test(i)))
  assert.ok(!critiquePlan(plan(long.map((l, i) => ({ ...l, startOffsetDays: i })), [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }])).some((i) => /no phases/.test(i)))
})

test('the same routine overlapping itself is sent back; phases that end are not', () => {
  const weekly = (days: number[], start: number, until?: number) => ({ frequency: 'weekly' as const, days, ...(until !== undefined ? { untilOffsetDays: until } : {}) })
  const overlapping = critiquePlan(plan([
    { title: 'Buy shoes', startOffsetDays: 0 },
    { title: 'Run-walk easily on Mondays', startOffsetDays: 0, repeats: weekly([1], 0) },
    { title: 'Run easily on Mondays', startOffsetDays: 21, repeats: weekly([1], 21) },
  ]))
  assert.ok(overlapping.some((i) => /overlapping/.test(i)))
  const phased = critiquePlan(plan([
    { title: 'Buy shoes', startOffsetDays: 0 },
    { title: 'Run-walk easily on Mondays', startOffsetDays: 0, repeats: weekly([1], 0, 20) },
    { title: 'Run easily on Mondays', startOffsetDays: 21, repeats: weekly([1], 21) },
  ]))
  assert.ok(!phased.some((i) => /overlapping/.test(i)), 'the earlier phase ends before the next begins')
  const different = critiquePlan(plan([
    { title: 'Buy shoes', startOffsetDays: 0 },
    { title: 'Run easily on Mondays', startOffsetDays: 0, repeats: weekly([1], 0) },
    { title: 'Stretch for ten minutes', startOffsetDays: 0, repeats: weekly([1], 0) },
  ]))
  assert.equal(different.length, 0, 'two different routines on one day are fine')
})

test('one routine on different days is told to be one step', () => {
  const issues = critiquePlan(plan([
    { title: 'Buy shoes', startOffsetDays: 0 },
    { title: 'Run easily on Mondays', startOffsetDays: 0, repeats: { frequency: 'weekly', days: [1] } },
    { title: 'Run easily on Wednesdays', startOffsetDays: 0, repeats: { frequency: 'weekly', days: [3] } },
  ]))
  assert.ok(issues.some((i) => /ONE weekly step/.test(i)))
})

test('a good plan passes: set-up, routines, a checkpoint, phases that end', () => {
  const issues = critiquePlan(plan([
    { title: 'Book a medical check-up', startOffsetDays: 1, headingKey: 'a' },
    { title: 'Buy running shoes', startOffsetDays: 0, headingKey: 'a' },
    { title: 'Run-walk 20 minutes', startOffsetDays: 2, headingKey: 'b', repeats: { frequency: 'weekly', days: [1, 3, 6], untilOffsetDays: 27 } },
    { title: 'Run 30 minutes steadily', startOffsetDays: 28, headingKey: 'b', repeats: { frequency: 'weekly', days: [1, 3, 6] } },
    { title: 'Review the week and adjust', startOffsetDays: 6, headingKey: 'b', repeats: { frequency: 'weekly', days: [0] } },
  ], [{ key: 'a', title: 'Get ready' }, { key: 'b', title: 'Build' }]))
  assert.deepEqual(issues, [])
})

test('a repeat that stops the day it starts is stored as one step, not a routine', () => {
  const r = compilePlan(base([{ title: 'Checkpoint: run 10 km', startOffsetDays: 20, repeats: { frequency: 'weekly', days: [6], untilOffsetDays: 20 } }, { title: 'Start', startOffsetDays: 0 }]), ctx)
  const checkpoint = created(r.operations).find((o) => o.kind === 'createNode' && o.properties.name === 'Checkpoint: run 10 km')
  assert.ok(checkpoint && checkpoint.kind === 'createNode')
  assert.ok(!('recurrence' in checkpoint.properties) && !('deadline' in checkpoint.properties))
})
