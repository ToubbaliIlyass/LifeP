import * as THREE from 'three'
import { colorOf, type Vote } from '@/lib/identity'
import { cityLayout, pathLayout, pathPoint, PATH_STEP, rng, skyLayout } from '@/lib/world-layout'

/**
 * The landing page's second story, drawn: the same 640 votes, rearranged
 * as the page scrolls — the mark's tick, a head full of open loops, a week
 * planned, the week that really happened, four people being become, and
 * then the three worlds the app can draw them as, from the real layouts
 * (src/lib/world-layout.ts), so what the page shows is what the app makes.
 *
 * Driven entirely by scroll: setProgress says where the reader is, and the
 * loop eases toward it. Loaded on demand by WhyStory.tsx, so the page's first
 * paint never waits for three.js.
 */

export const WHY_IDENTITIES = ['a runner', 'a writer', 'a good friend', 'someone who ships']
const N = 640
const HUES = [0, 1, 2, 3]

/** Formations, in story order. The last is the city again, quieter, under the closing words. */
export const WHY_PHASES = ['tick', 'loops', 'week', 'real', 'identity', 'sky', 'path', 'city', 'end'] as const

export interface WhyScene {
  /** f: 0→1 through the pinned story; enter: 0→1 as the section scrolls into view. */
  setProgress(f: number, enter: number): void
  dispose(): void
}

interface Pose { pos: THREE.Vector3; target: THREE.Vector3; fov: number; ox: number; oy: number }
interface Formation { pos: Float32Array; color: Float32Array; size: Float32Array; pose: Pose }

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const C = (hex: string) => new THREE.Color(hex)
const pose = (pos: [number, number, number], target: [number, number, number], fov: number, ox = 0, oy = 0): Pose =>
  ({ pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target), fov, ox, oy })

/** The demo's votes: four months of a life, a little denser lately. */
function demoVotes(): Vote[] {
  const r = rng(2026)
  const weights = [0.3, 0.24, 0.18, 0.14]
  return Array.from({ length: N }, (_, i) => {
    let x = r(), g = -1
    for (let k = 0; k < weights.length; k++) { if (x < weights[k]) { g = k; break } x -= weights[k] }
    return [Math.round(Math.pow(1 - i / N, 1.25) * 120), g] as Vote
  })
}

function build(narrow: boolean) {
  const votes = demoVotes()
  const r = rng(7)
  const groupColor = votes.map(([, g]) => C(colorOf(g, HUES)))
  const side = narrow ? 0 : -0.17
  const up = narrow ? 0.14 : 0
  const fit = narrow ? 1.9 : 1

  const make = (fill: (i: number, p: number[], c: THREE.Color) => number, p: Pose): Formation => {
    const pos = new Float32Array(N * 3), color = new Float32Array(N * 3), size = new Float32Array(N)
    const out = [0, 0, 0], c = new THREE.Color()
    for (let i = 0; i < N; i++) {
      size[i] = fill(i, out, c)
      pos.set(out, i * 3)
      color.set([c.r, c.g, c.b], i * 3)
    }
    return { pos, color, size, pose: p }
  }

  // The mark: two amber bars (a voice) and a white tick, as in the logo.
  const segs: [number, number, number, number, string][] = [
    [5, 14.5, 5, 17.5, '#F5A524'], [9.5, 11.5, 9.5, 20.5, '#F5A524'],
    [14, 16.5, 18, 20.5, '#ffffff'], [18, 20.5, 27.5, 10, '#ffffff'],
  ]
  const lens = segs.map(([a, b, c2, d]) => Math.hypot(c2 - a, d - b))
  const total = lens.reduce((s, l) => s + l, 0)
  const tick = make((i, p, c) => {
    let at = (i / N) * total, k = 0
    while (at > lens[k] && k < segs.length - 1) { at -= lens[k]; k++ }
    const [a, b, c2, d, hex] = segs[k], t = at / lens[k]
    p[0] = (a + (c2 - a) * t - 16) * 0.5 + (r() - 0.5) * 0.5
    p[1] = -(b + (d - b) * t - 16) * 0.5 + (r() - 0.5) * 0.5
    p[2] = (r() - 0.5) * 0.6
    c.set(hex)
    return 3.4
  }, pose([0, 0, 36 * fit], [0, 0, 0], 45, 0, narrow ? 0.14 : 0.1))

  // Open loops: a cloud, turning — positions here are the start; the loop stirs them.
  const loops = make((_, p, c) => {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = 2.5 + Math.cbrt(r()) * 5.5
    p[0] = Math.sqrt(1 - u * u) * Math.cos(a) * rad; p[1] = u * rad * 0.8; p[2] = Math.sqrt(1 - u * u) * Math.sin(a) * rad
    c.set('#f3e9d6')
    return 2.6 + r() * 1.6
  }, pose([0, 0, 30 * fit], [0, 0, 0], 45, side, up))

  // A week, planned: seven days across, the hours down. Mornings, mostly — plans are optimists.
  const slots = [7, 7, 7.5, 8, 8, 9, 9, 9.5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const plan = votes.map(() => ({ day: Math.floor(r() * 7), h: slots[Math.floor(r() * slots.length)], jx: (r() - 0.5) * 0.9, jy: (r() - 0.5) * 0.3 }))
  const dx = narrow ? 1.45 : 2.4
  const hourY = (h: number) => (14 - h) * 0.72
  const week = make((i, p, c) => {
    const q = plan[i]
    p[0] = (q.day - 3) * dx + q.jx * (narrow ? 0.6 : 1); p[1] = hourY(q.h) + q.jy; p[2] = 0
    c.set('#f3e9d6')
    return 3
  }, pose([0, 0, 28 * fit], [0, 0, 0], 45, side, up))
  // …and as it happened: about half on time, the rest later — often the evening.
  const real = make((i, p, c) => {
    const q = plan[i]
    const h = r() < 0.45 ? q.h + (r() - 0.5) * 0.8 : Math.min(22.3, q.h + 2 + r() * 8)
    p[0] = (q.day - 3) * dx + q.jx * (narrow ? 0.6 : 1); p[1] = hourY(h) + q.jy; p[2] = 0
    c.set(h >= 17 ? '#ffd28a' : '#f3e9d6')
    return 3
  }, pose([0, 0, 28 * fit], [0, 0, 0], 45, side, up))

  // Four people being become, and the everyday under them.
  const centers = narrow
    ? [[-3.4, 5], [3.4, 5], [-3.4, -0.8], [3.4, -0.8]]
    : [[-9.6, 1.6], [-3.2, 1.6], [3.2, 1.6], [9.6, 1.6]]
  const everydayY = narrow ? -6.4 : -5.4
  const identity = make((i, p, c) => {
    const g = votes[i][1]
    if (g < 0) {
      p[0] = (r() - 0.5) * (narrow ? 9 : 22); p[1] = everydayY + (r() - 0.5) * 1.6; p[2] = (r() - 0.5) * 2
    } else {
      const s = 0.65 + Math.sqrt([0.3, 0.24, 0.18, 0.14][g]) * 1.5
      const gs = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
      p[0] = centers[g][0] + gs() * s * 0.55; p[1] = centers[g][1] + gs() * s * 0.55; p[2] = gs() * s * 0.4
    }
    c.copy(groupColor[i])
    return g < 0 ? 2.4 : 3.2
  }, pose([0, 0, 30 * fit], [0, 0, 0], 45, side, up))

  // The sky, squeezed a little sideways so all four fit beside the words.
  const sky = skyLayout(votes, 4, [11, 12, 13, 14])
  const squeeze = (v: [number, number, number]): [number, number, number] => {
    const az = Math.atan2(v[0], -v[2]) * (narrow ? 0.24 : 0.45), el = Math.asin(v[1] / 100)
    return [Math.sin(az) * Math.cos(el) * 100, Math.sin(el) * 100, -Math.cos(az) * Math.cos(el) * 100]
  }
  const skyAt = sky.stars.map((s) => squeeze(s.p))
  const skyF = make((i, p, c) => {
    p[0] = skyAt[i][0]; p[1] = skyAt[i][1]; p[2] = skyAt[i][2]
    const s = sky.stars[i]
    c.copy(s.group < 0 ? C('#fff6e6') : C('#ffffff').lerp(groupColor[i], s.bright ? 0.5 : 0.7))
    if (s.group < 0) c.multiplyScalar(0.6)
    return s.bright ? 6.5 : s.group < 0 ? 2 : 2.8
  }, pose([0, 0, 0], [0, 48, -88], narrow ? 70 : 58, side, narrow ? 0.1 : 0))

  // The path, a third of its size, today nearest.
  const P = pathLayout(votes, [11, 12, 13, 14])
  const last = P.stones.at(-1)!.p
  const k = 0.32
  const pathF = make((i, p, c) => {
    const s = P.stones[i]
    p[0] = (s.p[0] - last[0]) * k; p[1] = 0.12; p[2] = (s.p[2] - last[2]) * k
    c.copy(groupColor[i])
    return s.age < 7 ? 4.2 : 3
  }, pose(narrow ? [2, 12, 20] : [3, 8.5, 13], [0, 0, -24], 50, side, up))
  const ribbon: number[] = []
  for (let s = 0; s <= P.end; s += PATH_STEP * 4) {
    const q = pathPoint(P.line, s).p
    ribbon.push((q[0] - last[0]) * k, 0.02, (q[2] - last[2]) * k)
  }

  // The city: a floor for every vote.
  const city = cityLayout(votes, 4, [11, 12, 13, 14])
  const cityF = make((i, p, c) => {
    const f = city.floors[i]
    p[0] = f.p[0]; p[1] = f.p[1] + 0.15; p[2] = f.p[2]
    c.copy(groupColor[i]).lerp(C('#ffe2b0'), 0.35)
    return 2.6
  }, pose([0, 0, 0], [0, 3, 0], 50, side, up))
  const radius = city.extent * (narrow ? 4 : 2.9)
  const buildings = new Map<number, { x: number; z: number; w: number; d: number; top: number; g: number }>()
  for (const f of city.floors) {
    const b = buildings.get(f.building)
    buildings.set(f.building, { x: f.p[0], z: f.p[2], w: f.w, d: f.d, top: Math.max(b?.top ?? 0, f.p[1] + 0.21), g: f.group })
  }
  const endF: Formation = { ...cityF, pose: pose([0, 0, 0], [0, 3, 0], 50, 0, narrow ? -0.16 : -0.2) }

  const labels = [
    ...WHY_IDENTITIES.map((name, g) => ({ text: name, color: colorOf(g, HUES), at: { identity: [centers[g][0], centers[g][1] - 2.6, 0] } as Record<string, number[]> })),
    { text: 'the everyday', color: '#cfc8b8', at: { identity: [0, everydayY - 1.6, 0] } as Record<string, number[]> },
    ...sky.labels.map((l) => ({ text: WHY_IDENTITIES[l.group], color: colorOf(l.group, HUES), at: { sky: squeeze(l.p) } as Record<string, number[]> })),
    ...'MTWTFSS'.split('').map((d, i) => ({ text: d, color: 'rgba(255,255,255,.55)', at: { week: [(i - 3) * dx, hourY(6.1), 0], real: [(i - 3) * dx, hourY(6.1), 0] } as Record<string, number[]> })),
    ...([[7, '7am'], [12, 'noon'], [19, '7pm']] as const).map(([h, t]) => ({ text: t, color: 'rgba(255,255,255,.45)', at: { week: [-3.6 * dx - 0.6, hourY(h), 0], real: [-3.6 * dx - 0.6, hourY(h), 0] } as Record<string, number[]> })),
    ...city.labels.map((l) => ({ text: l.group < 0 ? 'the everyday' : WHY_IDENTITIES[l.group], color: l.group < 0 ? '#cfc8b8' : colorOf(l.group, HUES), at: { city: l.p } as Record<string, number[]> })),
  ]

  return {
    formations: [tick, loops, week, real, identity, skyF, pathF, cityF, endF],
    skyLines: sky.lines.flatMap(([a, b]) => [...skyAt[a], ...skyAt[b]]),
    skyLineColors: sky.lines.flatMap(([, b]) => { const c = groupColor[b]; return [c.r, c.g, c.b, c.r, c.g, c.b] }),
    ribbon,
    buildings: [...buildings.values()],
    radius,
    labels,
  }
}

export function createWhyScene(canvas: HTMLCanvasElement, labelLayer: HTMLElement): WhyScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let w = 1, h = 1, narrow = false
  let B = build(false)

  // The points.
  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const colAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const sizeAttr = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage)
  const phase = new Float32Array(N).map((_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', colAttr)
  geo.setAttribute('size', sizeAttr)
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
  const pointsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 1 }, uTw: { value: still ? 0 : 0.25 } },
    vertexShader: `
      attribute vec3 color; attribute float size; attribute float phase;
      uniform float uTime; uniform float uPR; uniform float uTw;
      varying vec3 vColor; varying float vGlow;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 1.0 + uTw * sin(uTime * (1.2 + fract(abs(phase) * 5.0) * 1.6) + phase * 6.2831);
        gl_PointSize = size * uPR * tw * 1.45;
        vColor = color; vGlow = tw;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity; varying vec3 vColor; varying float vGlow;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        // A bright core and a soft halo, so a three-pixel point still reads as a light.
        float a = (smoothstep(0.5, 0.05, d) + pow(smoothstep(1.0, 0.0, d), 3.0) * 0.45) * vGlow * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor, a);
        #include <colorspace_fragment>
      }`,
  })
  // Drawn last and through everything: the lights are the point, the buildings only hold them.
  const points = new THREE.Points(geo, pointsMat)
  points.renderOrder = 2
  pointsMat.depthTest = false
  scene.add(points)

  // What each world adds besides its lights: the figures, the path, the buildings.
  let extras = new THREE.Group()
  let skyLines: THREE.LineSegments, ribbonLine: THREE.Line, towers: THREE.InstancedMesh
  const buildExtras = () => {
    scene.remove(extras)
    extras.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose() })
    extras = new THREE.Group()
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(B.skyLines, 3))
    lg.setAttribute('color', new THREE.Float32BufferAttribute(B.skyLineColors, 3))
    skyLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.Float32BufferAttribute(B.ribbon, 3))
    ribbonLine = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: '#e9d3a6', transparent: true, opacity: 0, depthWrite: false }))
    towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), B.buildings.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3()
    B.buildings.forEach((b, i) => {
      towers.setMatrixAt(i, m.compose(v.set(b.x, b.top / 2, b.z), q, s.set(b.w, b.top, b.d)))
      towers.setColorAt(i, C(colorOf(b.g, HUES)).lerp(C('#171927'), 0.94))
    })
    towers.renderOrder = 1
    extras.add(skyLines, ribbonLine, towers)
    scene.add(extras)
  }
  buildExtras()

  let labelEls: { el: HTMLElement; at: Record<string, THREE.Vector3> }[] = []
  const buildLabels = () => {
    labelLayer.replaceChildren()
    labelEls = B.labels.map((l) => {
      const el = document.createElement('div')
      el.textContent = l.text
      el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;opacity:0;color:${l.color};font-size:13px;font-weight:600;text-shadow:0 1px 10px rgba(0,0,0,.7)`
      labelLayer.appendChild(el)
      return { el, at: Object.fromEntries(Object.entries(l.at).map(([k, v]) => [k, new THREE.Vector3(v[0], v[1], v[2])])) }
    })
  }
  buildLabels()

  const resize = () => {
    const box = canvas.parentElement?.getBoundingClientRect()
    w = Math.max(1, Math.round(box?.width ?? 1)); h = Math.max(1, Math.round(box?.height ?? 1))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const n = w < 900
    if (n !== narrow) { narrow = n; B = build(narrow); buildExtras(); buildLabels() }
  }
  const ro = new ResizeObserver(resize)
  if (canvas.parentElement) ro.observe(canvas.parentElement)
  resize()

  let fT = 0, f = 0, enterT = 0, enter = 0
  let running = true
  const io = new IntersectionObserver(([e]) => { running = e.isIntersecting }, { rootMargin: '20% 0px' })
  io.observe(canvas)

  const v = new THREE.Vector3(), tgt = new THREE.Vector3()
  const t0 = performance.now()
  let raf = 0, last = t0
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const now = performance.now(), dt = Math.min(1, (now - last) / 1000)
    last = now
    if (!running || document.hidden) return
    const t = still ? 0 : (now - t0) / 1000
    // Eased toward the scroll by time, not by frame, so a slow device is not also a sluggish one.
    const follow = still ? 1 : 1 - Math.exp(-dt * 7)
    f += (fT - f) * follow
    enter += (enterT - enter) * follow

    const F = B.formations, NP = F.length
    const x = Math.min(NP - 1e-4, f * NP), c = Math.floor(x), lp = x - c
    const k = c < NP - 1 ? ease(clamp((lp - 0.62) / 0.38)) : 0
    const A = F[c], Bf = F[Math.min(NP - 1, c + 1)]
    const weight = (i: number) => (i === c ? 1 - k : 0) + (i === c + 1 ? k : 0)

    // The points: where they are between this formation and the next.
    const pos = posAttr.array as Float32Array, col = colAttr.array as Float32Array, size = sizeAttr.array as Float32Array
    const scatter = 1 - enter
    for (let i = 0; i < N; i++) {
      for (let a = 0; a < 3; a++) {
        let pa = A.pos[i * 3 + a], pb = Bf.pos[i * 3 + a]
        // The loops never sit still: each point circles at its own pace.
        if (c === 1 || c + 1 === 1) {
          const sp = 0.12 + (i % 7) * 0.025, ang = t * sp
          const lx = F[1].pos[i * 3], lz = F[1].pos[i * 3 + 2], ly = F[1].pos[i * 3 + 1]
          const val = a === 0 ? lx * Math.cos(ang) - lz * Math.sin(ang) : a === 2 ? lx * Math.sin(ang) + lz * Math.cos(ang) : ly + Math.sin(t * 0.7 + i) * 0.35
          if (c === 1) pa = val; else pb = val
        }
        let p = pa + (pb - pa) * k
        // Before the story pins: dust, gathering into the tick.
        if (c === 0 && scatter > 0) p += (((Math.sin(i * 91.7 + a * 17.3) * 43758.5) % 1)) * 46 * scatter * scatter
        pos[i * 3 + a] = p
        col[i * 3 + a] = A.color[i * 3 + a] + (Bf.color[i * 3 + a] - A.color[i * 3 + a]) * k
      }
      size[i] = A.size[i] + (Bf.size[i] - A.size[i]) * k
    }
    posAttr.needsUpdate = colAttr.needsUpdate = sizeAttr.needsUpdate = true
    pointsMat.uniforms.uTime.value = t
    pointsMat.uniforms.uPR.value = renderer.getPixelRatio()
    pointsMat.uniforms.uOpacity.value = clamp(enter * 1.4) * (c === 8 ? 0.7 : 1)

    // The camera, between poses; the city turns slowly on its own.
    const orbit = (P: Pose, i: number) => {
      if (i < 7) return P.pos
      const a = 0.75 + t * 0.03, el = 0.5
      return v.set(Math.sin(a) * B.radius * Math.cos(el), B.radius * Math.sin(el), Math.cos(a) * B.radius * Math.cos(el))
    }
    const pa = orbit(A.pose, c).clone(), pb = orbit(Bf.pose, Math.min(NP - 1, c + 1)).clone()
    camera.position.copy(pa.lerp(pb, k))
    tgt.copy(A.pose.target).lerp(Bf.pose.target, k)
    camera.lookAt(tgt)
    camera.fov = A.pose.fov + (Bf.pose.fov - A.pose.fov) * k
    const ox = A.pose.ox + (Bf.pose.ox - A.pose.ox) * k, oy = A.pose.oy + (Bf.pose.oy - A.pose.oy) * k
    camera.setViewOffset(w, h, ox * w, oy * h, w, h)
    camera.updateProjectionMatrix()

    ;(skyLines.material as THREE.LineBasicMaterial).opacity = weight(5) * 0.55
    ;(ribbonLine.material as THREE.LineBasicMaterial).opacity = weight(6) * 0.5
    ;(towers.material as THREE.MeshBasicMaterial).opacity = weight(7) * 0.9 + weight(8) * 0.6
    skyLines.visible = weight(5) > 0.01; ribbonLine.visible = weight(6) > 0.01; towers.visible = weight(7) + weight(8) > 0.01

    renderer.render(scene, camera)

    for (const l of labelEls) {
      let op = 0
      for (const [name, at] of Object.entries(l.at)) {
        const i = WHY_PHASES.indexOf(name as (typeof WHY_PHASES)[number])
        const wt = weight(i)
        if (wt <= op) continue
        v.copy(at).project(camera)
        if (v.z > 1) continue
        op = wt
        l.el.style.transform = `translate(-50%, -50%) translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`
      }
      l.el.style.opacity = String(clamp((op - 0.5) * 2))
    }
  }
  raf = requestAnimationFrame(loop)

  return {
    setProgress(nf, ne) { fT = nf; enterT = ne },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      geo.dispose(); pointsMat.dispose()
      extras.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose() })
      labelLayer.replaceChildren()
      renderer.dispose()
    },
  }
}
