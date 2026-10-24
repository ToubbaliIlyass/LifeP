import type { Vote } from '@/lib/identity'

/**
 * Where every vote goes, in each of the three worlds.
 *
 * Pure and deterministic: the same votes always make the same sky, the same
 * path, the same town, on every device and every visit — a world that
 * rearranged itself on reload would not feel like something built. Shapes
 * are seeded by the identity's id rather than its place in the list, so
 * reordering identities moves nothing.
 *
 * No three.js here: the app's world (src/components/world/scene.ts) and the
 * landing page's (src/components/landing/why-scene.ts) both draw from these
 * numbers, and the tests read them without a GPU.
 *
 *   sky   each identity a constellation. The bright stars that make its
 *         figure come at milestones, further apart as it grows; every other
 *         vote is a faint star near the figure. The everyday is the field.
 *   path  a step for every vote, on a path that winds away behind you into
 *         the past. Trees grow beside it in the colours of who you were
 *         being that day; a lantern every 25 steps.
 *   city  each identity a district of nine lots, a floor for each vote. A
 *         new building starts once one is up; when every lot has risen a few
 *         times, the district claims the next block out.
 */

export type V3 = [number, number, number]

/** mulberry32: small, fast, good enough to scatter stars. */
export function rng(seed: number) {
  let a = (seed | 0) + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
const seedOf = (seeds: number[], group: number) => (group < 0 ? 97 : (seeds[group] ?? group) * 7919 + 13)

// ── Sky ───────────────────────────────────────────────────────────────

export const SKY_R = 100

export interface SkyLayout {
  /** One per vote, in the votes' order. */
  stars: { p: V3; group: number; age: number; bright: boolean }[]
  /** The constellations' figures, as pairs of indices into `stars`. */
  lines: [number, number][]
  /** Where each identity's name goes, under its figure. */
  labels: { group: number; p: V3 }[]
}

/** The vote (1-based, within an identity) at which its k-th bright star appears. */
export const skyMilestone = (k: number) => Math.round(1 + 1.6 * Math.pow(k, 1.6))
const MAX_BRIGHT = 40

function skyCenter(g: number, groups: number): V3 {
  const span = groups <= 1 ? 0 : Math.min(130, 30 + groups * 24)
  const az = ((groups <= 1 ? 0 : -span / 2 + (span * (g + 0.5)) / groups) * Math.PI) / 180
  const el = (((g % 2 === 0 ? 26 : 44) + (groups <= 1 ? 8 : 0)) * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
}

function onDome(c: V3, u: number, v: number): V3 {
  // A tangent frame at the centre: right is level with the horizon, up is up the dome.
  const rl = Math.hypot(c[2], c[0]) || 1
  const right: V3 = [-c[2] / rl, 0, c[0] / rl]
  const up: V3 = [
    right[1] * c[2] - right[2] * c[1],
    right[2] * c[0] - right[0] * c[2],
    right[0] * c[1] - right[1] * c[0],
  ]
  const x = c[0] * SKY_R + right[0] * u + up[0] * v
  const y = c[1] * SKY_R + right[1] * u + up[1] * v
  const z = c[2] * SKY_R + right[2] * u + up[2] * v
  const l = Math.hypot(x, y, z) || 1
  return [(x / l) * SKY_R, (y / l) * SKY_R, (z / l) * SKY_R]
}

export function skyLayout(votes: Vote[], groups: number, seeds: number[] = []): SkyLayout {
  const stars: SkyLayout['stars'] = []
  const lines: SkyLayout['lines'] = []
  const per = Array.from({ length: groups }, (_, g) => ({
    r: rng(seedOf(seeds, g)),
    count: 0,
    /** The figure so far: local position and index into `stars`. */
    bright: [] as { u: number; v: number; i: number }[],
    center: skyCenter(g, groups),
  }))
  const field = rng(seedOf(seeds, -1))

  for (const [age, group] of votes) {
    const i = stars.length
    const G = group >= 0 && group < groups ? per[group] : null
    if (!G) {
      // The everyday: anywhere in the sky, thickening the field.
      const az = (field() * 2 - 1) * 1.35
      const el = Math.asin(0.07 + field() * 0.88)
      const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
      stars.push({ p: [d[0] * SKY_R, d[1] * SKY_R, d[2] * SKY_R], group: -1, age, bright: false })
      continue
    }
    G.count++
    const r = G.r
    if (G.bright.length < MAX_BRIGHT && G.count === skyMilestone(G.bright.length)) {
      const k = G.bright.length
      let u = 0, v = 0, parent = -1
      if (k > 0) {
        const limit = 9 + 2.2 * Math.sqrt(k)
        for (let tries = 0; tries < 18; tries++) {
          parent = r() < 0.55 ? k - 1 : Math.floor(r() * k)
          const a = r() * Math.PI * 2, len = 4 + r() * 4.5
          u = G.bright[parent].u + Math.cos(a) * len
          v = G.bright[parent].v + Math.sin(a) * len * 0.8
          const clear = G.bright.every((b) => Math.hypot(b.u - u, b.v - v) > 3.2)
          if (clear && Math.hypot(u, v) < limit) break
        }
        lines.push([G.bright[parent].i, i])
      }
      G.bright.push({ u, v, i })
      stars.push({ p: onDome(G.center, u, v), group, age, bright: true })
    } else {
      // A faint star, near the figure as it is now.
      const near = G.bright[Math.floor(Math.pow(r(), 0.8) * G.bright.length)]
      stars.push({ p: onDome(G.center, near.u + gauss(r) * 2, near.v + gauss(r) * 1.7), group, age, bright: false })
    }
  }

  const labels = per.flatMap((G, group) => {
    if (!G.bright.length) return []
    const u = G.bright.reduce((s, b) => s + b.u, 0) / G.bright.length
    const v = Math.min(...G.bright.map((b) => b.v)) - 5
    return [{ group, p: onDome(G.center, u, v) }]
  })
  return { stars, lines, labels }
}

// ── Path ──────────────────────────────────────────────────────────────

/** Arc length between samples of the path's centre line. */
export const PATH_STEP = 0.25
/** Arc length between one step and the next. */
export const STRIDE = 0.62
const PATH_START = 3
/** How much path is laid ahead of today: the next steps, not taken yet. */
const AHEAD = 16

export interface PathLayout {
  /** The centre line, x and z every PATH_STEP from the first step to past the last. */
  line: Float32Array
  /** One per vote, in the votes' order. */
  stones: { p: V3; rot: number; group: number; age: number }[]
  trees: { p: V3; group: number; scale: number; age: number }[]
  lanterns: { p: V3; n: number }[]
  /** Arc length of today's step. */
  end: number
}

/** Which way the path is heading at arc length s: a slow meander of two waves. */
const heading = (s: number) => 0.5 * Math.sin(s / 11 + 0.6) + 0.32 * Math.sin(s / 27 + 2.1)

export function pathLayout(votes: Vote[], seeds: number[] = []): PathLayout {
  const end = PATH_START + Math.max(0, votes.length - 1) * STRIDE
  const total = end + AHEAD
  const n = Math.ceil(total / PATH_STEP) + 1
  const line = new Float32Array(n * 2)
  let x = 0, z = 0
  for (let i = 0; i < n; i++) {
    line[i * 2] = x
    line[i * 2 + 1] = z
    const a = heading(i * PATH_STEP)
    x += Math.sin(a) * PATH_STEP
    z += Math.cos(a) * PATH_STEP
  }

  const at = (s: number, side: number): V3 => {
    const k = Math.min(n - 2, Math.max(0, s / PATH_STEP))
    const i = Math.floor(k), t = k - i
    const cx = line[i * 2] + (line[i * 2 + 2] - line[i * 2]) * t
    const cz = line[i * 2 + 1] + (line[i * 2 + 3] - line[i * 2 + 1]) * t
    const a = heading(s)
    return [cx + Math.cos(a) * side, 0, cz - Math.sin(a) * side]
  }

  const r = rng(seedOf(seeds, -1) + 1)
  const grown = new Map<number, number>()
  const stones: PathLayout['stones'] = []
  const trees: PathLayout['trees'] = []
  const lanterns: PathLayout['lanterns'] = []
  votes.forEach(([age, group], i) => {
    const s = PATH_START + i * STRIDE
    // Footsteps: a little left, a little right.
    stones.push({ p: at(s, (i % 2 ? 0.17 : -0.17) + (r() - 0.5) * 0.08), rot: heading(s) + (r() - 0.5) * 0.5, group, age })
    const c = (grown.get(group) ?? 0) + 1
    grown.set(group, c)
    if (c % (group < 0 ? 9 : 4) === 0) {
      const side = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 3.6)
      trees.push({ p: at(s + (r() - 0.5) * 2, side), group, scale: 0.7 + r() * 0.65, age })
    }
    if ((i + 1) % 25 === 0) lanterns.push({ p: at(s, ((i + 1) / 25) % 2 ? 0.95 : -0.95), n: i + 1 })
  })
  return { line, stones, trees, lanterns, end }
}

/** A point on the centre line, and the way it is heading. For the camera. */
export function pathPoint(line: Float32Array, s: number): { p: V3; heading: number } {
  const n = line.length / 2
  const k = Math.min(n - 1.001, Math.max(0, s / PATH_STEP))
  const i = Math.floor(k), t = k - i
  return {
    p: [line[i * 2] + (line[i * 2 + 2] - line[i * 2]) * t, 0, line[i * 2 + 1] + (line[i * 2 + 3] - line[i * 2 + 1]) * t],
    heading: heading(s),
  }
}

// ── City ──────────────────────────────────────────────────────────────

export const BLOCK = 10
export const PITCH = 13
export const FLOOR_H = 0.42
/** Times every lot in a district rises before the district claims another block. */
const ROUNDS_PER_BLOCK = 6
const LOTS = [-3.2, 0, 3.2].flatMap((lx) => [-3.2, 0, 3.2].map((lz) => [lx, lz] as const))

export interface CityLayout {
  /** One per vote, in the votes' order: a floor of some building. */
  floors: { p: V3; w: number; d: number; group: number; age: number; building: number }[]
  /** Each block in use, by whom; (0, 0) is always the park. */
  blocks: { group: number; x: number; z: number }[]
  labels: { group: number; p: V3 }[]
  /** How far from the middle the town reaches. */
  extent: number
}

/** The blocks around the park, nearest first: a square spiral. */
export function spiral(count: number): [number, number][] {
  const out: [number, number][] = []
  let x = 0, z = 0, dx = 1, dz = 0, len = 1, run = 0, turns = 0
  while (out.length < count) {
    x += dx; z += dz; run++
    out.push([x, z])
    if (run === len) {
      run = 0;
      [dx, dz] = [-dz, dx]
      if (++turns % 2 === 0) len++
    }
  }
  return out
}

export function cityLayout(votes: Vote[], groups: number, seeds: number[] = []): CityLayout {
  const slots = spiral(64)
  let nextSlot = 0
  const blocks: CityLayout['blocks'] = []
  let buildings = 0
  type District = { r: () => number; block: [number, number]; lots: { w: number; d: number; base: number; h: number; id: number }[]; order: number[]; round: number; cursor: number; tallest: number }
  const districts = new Map<number, District>()

  const claim = (group: number): District => {
    const [bx, bz] = slots[Math.min(nextSlot++, slots.length - 1)]
    blocks.push({ group, x: bx * PITCH, z: bz * PITCH })
    const r = rng(seedOf(seeds, group) + nextSlot * 31)
    const lots = LOTS.map((_, li) => ({ w: 1.7 + r() * 1, d: 1.7 + r() * 1, base: 2 + Math.floor(r() * 4) + (li === 4 ? 2 : 0), h: 0, id: -1 }))
    // The middle lot first, then the rest in a shuffled order.
    const rest = [0, 1, 2, 3, 5, 6, 7, 8]
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]]
    }
    return { r, block: [bx * PITCH, bz * PITCH], lots, order: [4, ...rest], round: 0, cursor: 0, tallest: 0 }
  }

  const floors: CityLayout['floors'] = []
  for (const [age, rawGroup] of votes) {
    const group = rawGroup >= 0 && rawGroup < groups ? rawGroup : -1
    let D = districts.get(group)
    if (!D) { D = claim(group); districts.set(group, D) }
    // The next lot with room this round; a new round when none has.
    let lot = D.lots[D.order[D.cursor]]
    while (lot.h >= lot.base * (D.round + 1)) {
      D.cursor++
      if (D.cursor >= D.lots.length) {
        D.cursor = 0
        D.round++
        if (D.round >= ROUNDS_PER_BLOCK) { D = claim(group); districts.set(group, D) }
      }
      lot = D.lots[D.order[D.cursor]]
    }
    if (lot.id < 0) lot.id = buildings++
    const [lx, lz] = LOTS[D.order[D.cursor]]
    floors.push({ p: [D.block[0] + lx, (lot.h + 0.5) * FLOOR_H, D.block[1] + lz], w: lot.w, d: lot.d, group, age, building: lot.id })
    lot.h++
    D.tallest = Math.max(D.tallest, lot.h)
  }

  const first = new Map<number, { x: number; z: number }>()
  for (const b of blocks) if (!first.has(b.group)) first.set(b.group, b)
  const tallestIn = new Map<number, number>()
  for (const f of floors) tallestIn.set(f.group, Math.max(tallestIn.get(f.group) ?? 0, f.p[1]))
  const labels = [...first].map(([group, b]) => ({ group, p: [b.x, (tallestIn.get(group) ?? 0) + 1.6, b.z] as V3 }))
  const reach = blocks.reduce((m, b) => Math.max(m, Math.abs(b.x), Math.abs(b.z)), 0)
  return { floors, blocks, labels, extent: reach + BLOCK / 2 + 2 }
}
