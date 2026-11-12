import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawerSettles, project, rubberband, velocityOf } from './gesture'

test('a flick is projected the way scrolling decelerates', () => {
  assert.ok(Math.abs(project(1000) - 499) < 1)
  assert.ok(Math.abs(project(-1000) + 499) < 1)
  assert.equal(project(0), 0)
})

test('resistance grows the further past the edge', () => {
  const a = rubberband(40, 400), b = rubberband(400, 400)
  assert.ok(a < 40)
  assert.ok(b < 400 * 0.55)
  assert.ok(b / 400 < a / 40)
  assert.ok(Math.abs(rubberband(-40, 400) + a) < 1e-9)
})

test('finger speed is read from the last moments only', () => {
  const h = [{ x: 0, t: 0 }, { x: 300, t: 400 }, { x: 310, t: 450 }, { x: 330, t: 500 }]
  // last 100ms: from x=300 at t=400 to x=330 at t=500 → 300 px/s
  assert.ok(Math.abs(velocityOf(h) - 300) < 1)
  assert.equal(velocityOf([{ x: 5, t: 0 }]), 0)
})

test('a drawer shuts on a fast flick and springs back from a slow short drag', () => {
  assert.equal(drawerSettles(-60, -900, 390), 'closed')
  assert.equal(drawerSettles(-60, 0, 390), 'open')
  assert.equal(drawerSettles(-250, 0, 390), 'closed')
  assert.equal(drawerSettles(-250, 800, 390), 'open')
})
