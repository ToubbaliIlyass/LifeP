import * as THREE from 'three'
import { colorOf, type WorldKind, type WorldPayload } from '@/lib/identity'
import {
  BLOCK, FLOOR_H, PATH_STEP, SKY_R, cityLayout, pathLayout, pathPoint, rng, skyLayout,
} from '@/lib/world-layout'

/**
 * The world, drawn: one three.js scene for whichever of the three the user
 * chose, built from the layouts in src/lib/world-layout.ts.
 *
 * Imperative on purpose and loaded on demand (see WorldCanvas.tsx): three.js
 * is the heaviest thing in the app, and nobody who keeps the world switched
 * off should download a byte of it.
 *
 * Each world keeps its own time of day — the sky at night, the path at
 * golden hour, the town at blue hour — rather than following light or dark
 * mode: they are places, and places have their own light.
 */

export interface WorldScene {
  show(kind: WorldKind, data: WorldPayload): void
  /** The path only: 0 stands at today, 1 walks back to the first step. */
  lookBack(t: number): void
  dispose(): void
}

interface Label { el: HTMLElement; at: THREE.Vector3; far?: number }

// ── Shared pieces ─────────────────────────────────────────────────────

/** A gradient dome around everything: the sky at the given time of day. */
function skyDome(top: string, horizon: string, bottom: string) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) }, uBottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(uHorizon, uBottom, pow(clamp(-h * 4.0, 0.0, 1.0), 0.6));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat)
  mesh.renderOrder = -1
  mesh.userData.follow = 'xyz'
  return mesh
}

/** Soft, additive points: stars, lit windows, lanterns. Sizes in CSS px, or world units when `atten`. */
function glowPoints(p: { pos: number[]; color: number[]; size: number[]; twinkle: number[]; atten: boolean; opacity?: number; far?: number }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.color, 3))
  g.setAttribute('size', new THREE.Float32BufferAttribute(p.size, 1))
  g.setAttribute('twinkle', new THREE.Float32BufferAttribute(p.twinkle, 1))
  const phase = new Float32Array(p.size.length)
  for (let i = 0; i < phase.length; i++) phase[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uScale: { value: 400 }, uAtten: { value: p.atten ? 1 : 0 }, uOpacity: { value: p.opacity ?? 1 }, uFar: { value: p.far ?? 0 } },
    vertexShader: `
      attribute vec3 color; attribute float size; attribute float twinkle; attribute float phase;
      uniform float uTime; uniform float uPR; uniform float uScale; uniform float uAtten; uniform float uFar;
      varying vec3 vColor; varying float vGlow;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 1.0 + twinkle * sin(uTime * (1.1 + fract(abs(phase) * 7.0) * 1.9) + phase * 6.2831);
        gl_PointSize = min(72.0, size * tw * mix(uPR, uScale / max(0.1, -mv.z), uAtten));
        // Into the fog, like everything else.
        vColor = color; vGlow = tw * (uFar > 0.0 ? smoothstep(uFar, uFar * 0.55, -mv.z) : 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity; varying vec3 vColor; varying float vGlow;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (smoothstep(0.5, 0.05, d) * 0.85 + pow(smoothstep(1.0, 0.0, d), 3.0) * 0.5) * clamp(vGlow, 0.0, 1.6) * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
  })
  return new THREE.Points(g, mat)
}

const col = (hex: string) => new THREE.Color(hex)
const mix = (a: string | THREE.Color, b: string | THREE.Color, t: number) => (typeof a === 'string' ? col(a) : a.clone()).lerp(typeof b === 'string' ? col(b) : b, t)
const push3 = (arr: number[], c: THREE.Color, k = 1) => arr.push(c.r * k, c.g * k, c.b * k)

interface Built {
  group: THREE.Group
  labels: { text: string; color: string; at: THREE.Vector3; far?: number; small?: boolean }[]
  /** Called every frame with the elapsed seconds; moves the camera. */
  frame: (t: number, cam: THREE.PerspectiveCamera, yaw: number, pitch: number, follow: number) => void
  fog?: THREE.Fog
  lookBack?: (t: number) => void
}

// ── Sky: each identity a constellation ───────────────────────────────

function buildSky(data: WorldPayload, hues: number[], seeds: number[], still: boolean): Built {
  const group = new THREE.Group()
  group.add(skyDome('#03040a', '#1a2147', '#05060a'))
  const n = data.identities.length
  const sky = skyLayout(data.votes, n, seeds)

  // The field: faint stars that were always there, so an empty sky is still a sky.
  const r = rng(4242)
  const fp: number[] = [], fc: number[] = [], fs: number[] = [], ft: number[] = []
  for (let i = 0; i < 1600; i++) {
    const az = r() * Math.PI * 2, el = Math.asin(0.02 + r() * 0.98)
    fp.push(Math.sin(az) * Math.cos(el) * 400, Math.sin(el) * 400, -Math.cos(az) * Math.cos(el) * 400)
    push3(fc, mix('#9fb0ff', '#fff4e0', r()), 0.35 + r() * 0.35)
    fs.push(0.8 + r() * 1.6)
    ft.push(still ? 0 : 0.35 * r())
  }
  group.add(glowPoints({ pos: fp, color: fc, size: fs, twinkle: ft, atten: false }))

  // The votes.
  const vp: number[] = [], vc: number[] = [], vs: number[] = [], vt: number[] = []
  for (const s of sky.stars) {
    const c = s.group < 0 ? col('#fff6e6') : mix('#ffffff', colorOf(s.group, hues), s.bright ? 0.5 : 0.7)
    const recent = s.age < 7
    vp.push(...s.p)
    push3(vc, c, s.bright ? 1 : s.group < 0 ? 0.55 : 0.75)
    vs.push((s.bright ? 7.5 : s.group < 0 ? 2.6 : 3.2) * (recent ? 1.35 : 1) * (s.age === 0 ? 1.25 : 1))
    vt.push(still ? 0 : recent ? 0.45 : s.bright ? 0.12 : 0.25)
  }
  if (vp.length) group.add(glowPoints({ pos: vp, color: vc, size: vs, twinkle: vt, atten: false }))

  // The figures.
  if (sky.lines.length) {
    const lp: number[] = [], lc: number[] = []
    for (const [a, b] of sky.lines) {
      const c = col(colorOf(sky.stars[b].group, hues))
      lp.push(...sky.stars[a].p, ...sky.stars[b].p)
      push3(lc, c, 0.55); push3(lc, c, 0.55)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3))
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })))
  }

  // Hills on the horizon, so the sky has somewhere to stand.
  const seg = 256, hp: number[] = [], hi: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const h = 8 + 6 * Math.sin(a * 3 + 1) + 3.5 * Math.sin(a * 7 + 2) + 1.6 * Math.sin(a * 19)
    hp.push(Math.sin(a) * 300, -60, -Math.cos(a) * 300, Math.sin(a) * 300, h - 6, -Math.cos(a) * 300)
    if (i < seg) { const k = i * 2; hi.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
  }
  const hills = new THREE.BufferGeometry()
  hills.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3))
  hills.setIndex(hi)
  group.add(new THREE.Mesh(hills, new THREE.MeshBasicMaterial({ color: '#05060b', side: THREE.DoubleSide })))

  const labels = sky.labels.map((l) => ({ text: data.identities[l.group].name, color: colorOf(l.group, hues), at: new THREE.Vector3(...l.p) }))
  const look = new THREE.Vector3()
  return {
    group, labels,
    frame: (t, cam, yaw, pitch) => {
      const drift = still ? 0 : Math.sin(t * 0.04) * 0.05
      const az = yaw + drift, el = 0.42 + pitch
      cam.position.set(0, 0, 0)
      look.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(SKY_R)
      cam.lookAt(look)
    },
  }
}

// ── Path: a step for every vote ──────────────────────────────────────

function buildPath(data: WorldPayload, hues: number[], seeds: number[], still: boolean): Built {
  const group = new THREE.Group()
  const horizon = '#f2b48a'
  group.add(skyDome('#3a4f86', horizon, '#6b7d4f'))
  const fog = new THREE.Fog(horizon, 14, 70)
  group.add(new THREE.HemisphereLight('#ffe2c4', '#4b6b3c', 1.3))
  const sun = new THREE.DirectionalLight('#ffd2a1', 2.2)
  sun.position.set(-30, 18, -40)
  group.add(sun)

  const P = pathLayout(data.votes, seeds)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshLambertMaterial({ color: '#7d9a57' }))
  ground.rotation.x = -Math.PI / 2
  ground.userData.follow = 'xz'
  group.add(ground)

  // The path itself: a sandy ribbon, the stretch ahead of today a little paler.
  const ribbon = (from: number, to: number, color: string, opacity: number) => {
    const pos: number[] = [], idx: number[] = []
    const n0 = Math.max(0, Math.floor(from / PATH_STEP)), n1 = Math.min(P.line.length / 2 - 1, Math.ceil(to / PATH_STEP))
    for (let i = n0, k = 0; i <= n1; i++, k++) {
      const { p, heading } = pathPoint(P.line, i * PATH_STEP)
      const w = 0.62
      pos.push(p[0] - Math.cos(heading) * w, 0.012, p[2] + Math.sin(heading) * w, p[0] + Math.cos(heading) * w, 0.012, p[2] - Math.sin(heading) * w)
      if (i < n1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide }))
  }
  group.add(ribbon(0, P.end + 0.4, '#dcc59a', 1))
  group.add(ribbon(P.end + 0.4, P.end + 16, '#e8d6b0', 0.45))

  // The steps.
  const stoneGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.09, 7)
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), Math.max(1, P.stones.length))
  stones.count = P.stones.length
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3()
  P.stones.forEach((st, i) => {
    q.setFromEuler(e.set(0, st.rot, 0))
    m.compose(v.set(st.p[0], 0.05, st.p[2]), q, s.set(1, 1, 1))
    stones.setMatrixAt(i, m)
    stones.setColorAt(i, st.group < 0 ? col('#c9c2b3') : mix(colorOf(st.group, hues), '#e9e2d2', Math.min(0.45, st.age / 120)))
  })
  group.add(stones)

  // Trees, in the colours of who planted them.
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5), new THREE.MeshLambertMaterial({ color: '#6b4a34' }), Math.max(1, P.trees.length))
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, P.trees.length))
  trunk.count = crown.count = P.trees.length
  P.trees.forEach((t, i) => {
    m.compose(v.set(t.p[0], 0.45 * t.scale, t.p[2]), q.identity(), s.setScalar(t.scale))
    trunk.setMatrixAt(i, m)
    m.compose(v.set(t.p[0], 1.15 * t.scale, t.p[2]), q.setFromEuler(e.set(0, i, 0)), s.set(t.scale, t.scale * 1.25, t.scale))
    crown.setMatrixAt(i, m)
    crown.setColorAt(i, t.group < 0 ? col('#5d8a4c') : mix(colorOf(t.group, hues), '#4f8a4a', 0.3))
  })
  group.add(trunk, crown)

  // Lanterns every 25 steps, the steps from this week glowing, and the one ahead.
  const gp: number[] = [], gc: number[] = [], gs: number[] = [], gt: number[] = []
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), new THREE.MeshLambertMaterial({ color: '#3b2f2a' }), Math.max(1, P.lanterns.length))
  posts.count = P.lanterns.length
  P.lanterns.forEach((l, i) => {
    m.compose(v.set(l.p[0], 0.55, l.p[2]), q.identity(), s.set(1, 1, 1))
    posts.setMatrixAt(i, m)
    gp.push(l.p[0], 1.15, l.p[2]); push3(gc, col('#ffcf7a')); gs.push(0.9); gt.push(still ? 0 : 0.08)
  })
  group.add(posts)
  for (const st of P.stones) {
    if (st.age >= 7) continue
    gp.push(st.p[0], 0.13, st.p[2]); push3(gc, st.group < 0 ? col('#fff2d6') : col(colorOf(st.group, hues)), 0.7); gs.push(st.age === 0 ? 0.32 : 0.2); gt.push(still ? 0 : 0.3)
  }
  const ahead = pathPoint(P.line, P.end + (data.votes.length ? 0.62 : 0))
  gp.push(ahead.p[0], 0.12, ahead.p[2]); push3(gc, col('#ffffff'), 0.9); gs.push(0.6); gt.push(still ? 0 : 0.6)
  group.add(glowPoints({ pos: gp, color: gc, size: gs, twinkle: gt, atten: true, far: 70 }))

  // Low hills, kept off the path.
  const hr = rng(77), hillGeo = new THREE.SphereGeometry(1, 20, 10)
  const hillMat = new THREE.MeshLambertMaterial({ color: '#6f8d4e' })
  for (let i = 0, hills = Math.min(300, 24 + Math.round(P.end / 6)); i < hills; i++) {
    const sAt = hr() * (P.end + 30) - 10, side = (hr() < 0.5 ? -1 : 1) * (14 + hr() * 30)
    const { p, heading } = pathPoint(P.line, Math.max(0, sAt))
    const hill = new THREE.Mesh(hillGeo, hillMat)
    hill.position.set(p[0] + Math.cos(heading) * side, -1, p[2] - Math.sin(heading) * side)
    // Never over the path: as wide as the gap to it allows.
    const reach = Math.min(8 + hr() * 14, Math.abs(side) - 5)
    hill.scale.set(reach, 2 + hr() * 5, reach)
    group.add(hill)
  }

  const labels: Built['labels'] = []
  if (data.votes.length) labels.push({ text: 'Today', color: '#ffffff', at: new THREE.Vector3(P.stones.at(-1)!.p[0], 0.9, P.stones.at(-1)!.p[2]), far: 40, small: true })
  for (const l of P.lanterns) if (l.n % 100 === 0) labels.push({ text: String(l.n), color: '#ffe3ad', at: new THREE.Vector3(l.p[0], 1.6, l.p[2]), far: 45, small: true })

  let back = 0, backTarget = 0
  const at = new THREE.Vector3(), eye = new THREE.Vector3()
  return {
    group, labels, fog,
    lookBack: (t) => { backTarget = Math.max(0, Math.min(1, t)) },
    frame: (t, cam, yaw, pitch, follow) => {
      back += (backTarget - back) * follow
      // A short path is seen from a little way off, so the first steps are in view.
      const here = Math.max(P.end + 5, 13) - back * Math.max(0, P.end - 6)
      const a = pathPoint(P.line, here), b = pathPoint(P.line, Math.max(0, here - 10))
      const sway = still ? 0 : Math.sin(t * 0.15) * 0.04
      const ang = a.heading + Math.PI + yaw + sway
      at.set(b.p[0], 0.4, b.p[2])
      const dist = Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]) + 0.01
      eye.set(at.x - Math.sin(ang) * dist, 3.4 + pitch * 8, at.z - Math.cos(ang) * dist)
      cam.position.copy(eye)
      cam.lookAt(at)
    },
  }
}

// ── City: a floor for every vote ─────────────────────────────────────

function buildCity(data: WorldPayload, hues: number[], seeds: number[], still: boolean): Built {
  const group = new THREE.Group()
  const n = data.identities.length
  const C = cityLayout(data.votes, n, seeds)
  group.add(skyDome('#141a3d', '#e59a7c', '#14162a'))
  const fog = new THREE.Fog('#4b3f63', C.extent * 1.6, C.extent * 4 + 60)
  group.add(new THREE.HemisphereLight('#9fb3ff', '#2a2340', 1.2))
  const moon = new THREE.DirectionalLight('#ffd9c2', 1.1)
  moon.position.set(40, 60, 25)
  group.add(moon)

  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshLambertMaterial({ color: '#1b1d2e' }))
  ground.rotation.x = -Math.PI / 2
  group.add(ground)

  // The blocks: pavement, and the park in the middle.
  const slab = new THREE.BoxGeometry(BLOCK, 0.14, BLOCK)
  const park = new THREE.Mesh(slab, new THREE.MeshLambertMaterial({ color: '#2f5a3c' }))
  park.position.y = 0.07
  group.add(park)
  const pave = new THREE.InstancedMesh(slab, new THREE.MeshLambertMaterial({ color: '#34374d' }), Math.max(1, C.blocks.length))
  pave.count = C.blocks.length
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3()
  C.blocks.forEach((b, i) => { pave.setMatrixAt(i, m.compose(v.set(b.x, 0.07, b.z), q, s.set(1, 1, 1))) })
  group.add(pave)

  // The buildings, a floor at a time, their bodies dark and tinted.
  const floors = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 }), Math.max(1, C.floors.length))
  floors.count = C.floors.length
  const gp: number[] = [], gc: number[] = [], gs: number[] = [], gt: number[] = []
  const r = rng(99)
  const warm = col('#ffd9a0')
  const tops = new Map<number, (typeof C.floors)[number]>()
  C.floors.forEach((f, i) => {
    floors.setMatrixAt(i, m.compose(v.set(f.p[0], f.p[1] + 0.14, f.p[2]), q, s.set(f.w, FLOOR_H * 0.94, f.d)))
    floors.setColorAt(i, mix(f.group < 0 ? '#8d8a99' : colorOf(f.group, hues), '#1f2236', 0.7))
    tops.set(f.building, f)
    // Windows: every one lit on floors from this week, about half on the rest.
    const lit = mix(warm, f.group < 0 ? warm : col(colorOf(f.group, hues)), 0.3)
    for (const side of [0, 1, 2, 3]) {
      const along = side % 2 === 0 ? f.w : f.d
      const count = Math.max(1, Math.floor(along / 0.55))
      for (let k = 0; k < count; k++) {
        const on = f.age < 7 || r() < 0.45
        if (!on) continue
        const off = (k + 0.5) / count - 0.5
        const x = side === 0 ? off * f.w : side === 2 ? -off * f.w : side === 1 ? f.w / 2 + 0.02 : -f.w / 2 - 0.02
        const z = side === 1 ? off * f.d : side === 3 ? -off * f.d : side === 0 ? f.d / 2 + 0.02 : -f.d / 2 - 0.02
        gp.push(f.p[0] + x, f.p[1] + 0.16, f.p[2] + z)
        push3(gc, lit, f.age < 7 ? 1 : 0.55)
        gs.push(f.age < 7 ? 0.42 : 0.3)
        gt.push(still ? 0 : f.age === 0 ? 0.35 : 0.04)
      }
    }
  })
  group.add(floors)

  // A red light on top of the building that grew last, as on any town's tallest crane.
  const newest = C.floors.at(-1)
  if (newest) {
    const top = tops.get(newest.building)!
    gp.push(top.p[0], top.p[1] + 0.5, top.p[2]); push3(gc, col('#ff4d4d')); gs.push(0.9); gt.push(still ? 0 : 0.9)
  }

  // Streetlights round every block, and trees in the park.
  for (const b of [{ x: 0, z: 0 }, ...C.blocks]) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
      gp.push(b.x + dx * (BLOCK / 2 + 0.6), 0.9, b.z + dz * (BLOCK / 2 + 0.6)); push3(gc, col('#ffc77a'), 0.8); gs.push(0.55); gt.push(0)
    }
  }
  const tr = rng(5)
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: '#3f7a4c', flatShading: true }), 9)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + tr()
    crowns.setMatrixAt(i, m.compose(v.set(Math.cos(a) * (2 + tr() * 2.2), 0.95, Math.sin(a) * (2 + tr() * 2.2)), q, s.setScalar(0.8 + tr() * 0.6)))
  }
  group.add(crowns)
  gp.push(0, 0.4, 0); push3(gc, col('#9fd8ff')); gs.push(1.6); gt.push(still ? 0 : 0.2)
  group.add(glowPoints({ pos: gp, color: gc, size: gs, twinkle: gt, atten: true, far: C.extent * 4 + 60 }))

  const labels = C.labels.map((l) => ({
    text: l.group < 0 ? 'The everyday' : data.identities[l.group].name,
    color: l.group < 0 ? '#ece6d8' : colorOf(l.group, hues),
    at: new THREE.Vector3(...l.p),
  }))
  const radius = Math.max(24, C.extent * 2.2)
  return {
    group, labels, fog,
    frame: (t, cam, yaw, pitch) => {
      const a = (still ? 0.6 : 0.6 + t * 0.025) + yaw
      const el = 0.62 + pitch
      cam.position.set(Math.sin(a) * radius * Math.cos(el), radius * Math.sin(el), Math.cos(a) * radius * Math.cos(el))
      cam.lookAt(0, 1.5, 0)
    },
  }
}

// ── The scene ─────────────────────────────────────────────────────────

export function createWorldScene(canvas: HTMLCanvasElement, labelLayer: HTMLElement): WorldScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2000)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let built: Built | null = null
  let labels: Label[] = []
  let w = 1, h = 1

  const resize = () => {
    const box = canvas.parentElement?.getBoundingClientRect()
    w = Math.max(1, Math.round(box?.width ?? 1)); h = Math.max(1, Math.round(box?.height ?? 1))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w < 560 ? 66 : 58
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  if (canvas.parentElement) ro.observe(canvas.parentElement)
  resize()

  // Drag to look around; it eases back a little when let go.
  let yaw = 0, pitch = 0, yawT = 0, pitchT = 0, dragging: { x: number; y: number } | null = null
  const down = (e: PointerEvent) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId) }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    yawT -= (e.clientX - dragging.x) * 0.004
    pitchT = Math.max(-0.25, Math.min(0.3, pitchT + (e.clientY - dragging.y) * 0.002))
    dragging = { x: e.clientX, y: e.clientY }
  }
  const up = () => { dragging = null }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)

  // Only drawn while it can be seen.
  let visible = true
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting })
  io.observe(canvas)

  const v = new THREE.Vector3()
  const t0 = performance.now()
  let raf = 0, last = t0
  const loop = () => {
    raf = requestAnimationFrame(loop)
    if (!built || !visible || document.hidden) { last = performance.now(); return }
    const t = (performance.now() - t0) / 1000
    const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000)
    last = now
    const follow = 1 - Math.exp(-dt * 5)
    yaw += (yawT - yaw) * follow
    pitch += (pitchT - pitch) * follow
    if (!dragging) { yawT *= Math.exp(-dt * 0.3); pitchT *= Math.exp(-dt * 0.6) }
    built.frame(t, camera, yaw, pitch, follow)
    for (const o of built.group.children) {
      if (o.userData.follow === 'xyz') o.position.copy(camera.position)
      else if (o.userData.follow === 'xz') o.position.set(camera.position.x, 0, camera.position.z)
    }
    const scale = renderer.getPixelRatio() * h / (2 * Math.tan((camera.fov * Math.PI) / 360))
    built.group.traverse((o) => {
      const mat = (o as THREE.Points).material as THREE.ShaderMaterial | undefined
      if (mat?.uniforms?.uTime) {
        mat.uniforms.uTime.value = still ? 0 : t
        mat.uniforms.uPR.value = renderer.getPixelRatio()
        mat.uniforms.uScale.value = scale
      }
    })
    renderer.render(scene, camera)
    for (const l of labels) {
      v.copy(l.at)
      const dist = v.distanceTo(camera.position)
      v.project(camera)
      const hidden = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (l.far !== undefined && dist > l.far)
      l.el.style.opacity = hidden ? '0' : '1'
      if (!hidden) l.el.style.transform = `translate(-50%, -50%) translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`
    }
  }
  raf = requestAnimationFrame(loop)

  const clear = () => {
    if (!built) return
    scene.remove(built.group)
    built.group.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    built = null
    labelLayer.replaceChildren()
    labels = []
  }

  return {
    show(kind, data) {
      clear()
      const hues = data.identities.map((i) => i.hue)
      const seeds = data.identities.map((i) => i.id)
      built = kind === 'sky' ? buildSky(data, hues, seeds, still) : kind === 'path' ? buildPath(data, hues, seeds, still) : buildCity(data, hues, seeds, still)
      scene.add(built.group)
      scene.fog = built.fog ?? null
      yaw = yawT = pitch = pitchT = 0
      labels = built.labels.map((l) => {
        const el = document.createElement('div')
        el.textContent = l.text
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .3s;color:${l.color};font-size:${l.small ? 11 : 12.5}px;font-weight:600;letter-spacing:.01em;text-shadow:0 1px 8px rgba(0,0,0,.65)`
        labelLayer.appendChild(el)
        return { el, at: l.at, far: l.far }
      })
    },
    lookBack(t) { built?.lookBack?.(t) },
    dispose() {
      cancelAnimationFrame(raf)
      clear()
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      renderer.dispose()
    },
  }
}
