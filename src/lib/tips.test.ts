import test from 'node:test'
import assert from 'node:assert/strict'
import { TIPS, TIP_GAP, EMPTY_TIP_STATE, chooseTip, type TipCtx } from './tips'

const ctx: TipCtx = { todos: [], lists: [], events: 0, touch: false, installed: false }
const always = () => 0 // under the chance: a tip whenever one is allowed

test('every tip has a unique id and short text', () => {
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length)
  for (const t of TIPS) {
    assert.ok(t.title.length > 0 && t.title.length <= 40, t.id)
    assert.ok(t.body.length > 0 && t.body.length <= 160, t.id)
  }
})

test('no tip until the gap has passed, and never twice inside it', () => {
  let state = EMPTY_TIP_STATE
  const shown: number[] = []
  for (let visit = 1; visit <= 20; visit++) {
    const r = chooseTip(state, ctx, always)
    state = r.state
    if (r.tip) shown.push(visit)
  }
  assert.equal(shown[0], TIP_GAP)
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] - shown[i - 1] >= TIP_GAP)
})

test('chance can say no, and a busy slot is not spent', () => {
  const late = { opens: 50, lastAt: 0, seen: [] as string[] }
  assert.equal(chooseTip(late, ctx, () => 0.99).tip, null)
  const busy = chooseTip(late, ctx, always, false)
  assert.equal(busy.tip, null)
  assert.equal(busy.state.lastAt, 0)
  assert.equal(busy.state.opens, 51)
})

test('each tip comes once before any repeats', () => {
  let state = { opens: 100, lastAt: 0, seen: [] as string[] }
  const got: string[] = []
  const eligible = TIPS.filter((t) => t.on !== 'phone' && (t.when?.(ctx) ?? true)).length
  for (let i = 0; i < eligible; i++) {
    const r = chooseTip({ ...state, opens: state.opens + TIP_GAP }, ctx, always)
    state = r.state
    got.push(r.tip!.id)
  }
  assert.equal(new Set(got).size, eligible)
})

test('keyboard tips stay off touch screens', () => {
  for (let i = 0; i < 40; i++) {
    const r = chooseTip({ opens: 100, lastAt: 0, seen: [] }, { ...ctx, touch: true }, () => i / 40)
    if (r.tip) assert.notEqual(r.tip.on, 'desktop')
  }
})
