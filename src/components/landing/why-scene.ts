import * as THREE from 'three'
import { colorOf, type Vote } from '@/lib/identity'
import { cityLayout, rng, skyLayout } from '@/lib/world-layout'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mythicPath, skyDome, toyTown, type WhyWorld } from '@/components/world/dioramas'

/** The section's own dark, painted by the scene itself (see WhyStory). */
const BG = '#141413'

/**
 * The landing page's second story, drawn: the same 640 votes, rearranged
 * as the page scrolls — the mark's tick, things done scattered loose, the
 * same things sorted into who they were for, a week of small wins, a pile
 * that only grows, and then the three worlds the app can draw them as, from
 * the real layouts (src/lib/world-layout.ts), so what the page shows is
 * what the app makes.
 *
 * Driven entirely by scroll: setProgress says where the reader is, and the
 * loop eases toward it. Every camera is fitted to the screen it is on —
 * a phone held upright, an ultrawide, anything between — by the size of
 * what it frames, not by a distance tuned for one window. Loaded on demand
 * by WhyStory.tsx, so the page's first paint never waits for three.js.
 */

export const WHY_IDENTITIES = ['a runner', 'a writer', 'a good friend', 'someone who ships']
const N = 640
const HUES = [0, 1, 2, 3]
const SEEDS = [11, 12, 13, 14]

/** Formations, in story order. The last is the city again, quieter, under the closing words. */
export const WHY_PHASES = ['tick', 'evidence', 'identity', 'week', 'pile', 'sky', 'path', 'city', 'end'] as const

export interface WhyScene {
  /** f: 0→1 through the pinned story; enter: 0→1 as the section scrolls into view. */
  setProgress(f: number, enter: number): void
  /** On a narrow screen: how much of the top and bottom the words take, in px, so the picture fits between. */
  setInsets(top: number, bottom: number): void
  /** Whether it is on screen at all; nothing is drawn while it is not. */
  setActive(on: boolean): void
  dispose(): void
}

/**
 * How a formation is framed. `span` is the half-size of what must be seen,
 * in world units; the camera backs off along `dir` until it fits in the
 * share of the screen the words leave free. A sky has nothing to back away
 * from, so it stands at `at` instead.
 */
interface Pose {
  target: THREE.Vector3
  dir: THREE.Vector3
  span: [number, number]
  at?: THREE.Vector3
  orbit?: boolean
  /** How high the orbiting camera looks from (the y of its direction before normalising). */
  elev?: number
  /** Fills the whole screen, words and all, rather than the room the words leave. */
  full?: boolean
  fov: number
  /** Where the middle of the picture sits, as a share of the screen (view offset). */
  ox: number
  oy: number
  /** The share of the width and height the picture may use. */
  room: [number, number]
}
interface Formation { pos: Float32Array; color: Float32Array; size: Float32Array; pose: Pose }

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const C = (hex: string) => new THREE.Color(hex)
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

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

function build(narrow: boolean, short: boolean, path: WhyWorld, town: WhyWorld & { center: [number, number]; reach: number }) {
  const votes = demoVotes()
  const r = rng(7)
  const groupColor = votes.map(([, g]) => C(colorOf(g, HUES)))
  const warm = C('#f3e9d6')
  // Beside the words on a wide screen; above them on a narrow one.
  // A short screen (a phone on its side): more room for the words, the picture lower, clear of the bar.
  const side: Pick<Pose, 'ox' | 'oy' | 'room'> = narrow ? { ox: 0, oy: 0.17, room: [0.9, 0.42] }
    : short ? { ox: -0.22, oy: -0.08, room: [0.48, 0.68] }
    : { ox: -0.18, oy: 0, room: [0.56, 0.8] }
  const front = (target: THREE.Vector3, span: [number, number], extra: Partial<Pose> = {}): Pose =>
    ({ target, dir: V(0, 0, 1), span, fov: 40, ...side, ...extra })

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
  }, front(V(0.2, 0, 0), [8, 7], { ox: 0, oy: narrow ? 0.18 : 0.12, room: [0.8, 0.5] }))

  // Things done, loose: no pattern yet, only evidence. The loop keeps them drifting.
  const evidence = make((_, p, c) => {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rad = 2.5 + Math.cbrt(r()) * 6
    p[0] = Math.sqrt(1 - u * u) * Math.cos(a) * rad * 1.25; p[1] = u * rad * 0.75; p[2] = Math.sqrt(1 - u * u) * Math.sin(a) * rad
    c.copy(warm)
    return 2.6 + r() * 1.6
  }, front(V(0, 0, 0), [10, 7]))

  // The same things, sorted by who they were for. The everyday under them.
  const centers = narrow
    ? [[-4.2, 4.4], [4.2, 4.4], [-4.2, -0.6], [4.2, -0.6]]
    : [[-9.6, 1.6], [-3.2, 1.6], [3.2, 1.6], [9.6, 1.6]]
  const everydayY = narrow ? -5.6 : -5.4
  const gs = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const identity = make((i, p, c) => {
    const g = votes[i][1]
    if (g < 0) {
      p[0] = (r() - 0.5) * (narrow ? 11 : 22); p[1] = everydayY + (r() - 0.5) * 1.6; p[2] = (r() - 0.5) * 2
    } else {
      const s = 0.65 + Math.sqrt([0.3, 0.24, 0.18, 0.14][g]) * 1.5
      p[0] = centers[g][0] + gs() * s * 0.55; p[1] = centers[g][1] + gs() * s * 0.55; p[2] = gs() * s * 0.4
    }
    c.copy(groupColor[i])
    return g < 0 ? 2.4 : 3.2
  }, front(V(0, narrow ? -0.4 : -1, 0), narrow ? [7.4, 8.4] : [12.5, 8.5]))

  // A week of small wins: every day, a handful of small things done.
  const dx = narrow ? 1.45 : 2.4
  const week = make((i, p, c) => {
    const day = i % 7, n = Math.floor(i / 7)
    p[0] = (day - 3) * dx + ((n % 4) - 1.5) * (narrow ? 0.28 : 0.42) + (r() - 0.5) * 0.12
    p[1] = 4.6 - Math.floor(n / 4) * 0.42 + (r() - 0.5) * 0.12; p[2] = 0
    c.copy(groupColor[i])
    return 3
  }, front(V(0, 0.2, 0), [3 * dx + 1.4, 5.8]))

  // A pile that only grows: the oldest at the bottom, nothing ever taken off.
  const order = votes.map((v, i) => [v[0], i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)
  const pileAt = new Map<number, number[]>()
  const R = 8.5, H = 7.5
  order.forEach((i, rank) => {
    // Filled bottom up: each point a little higher than the last, anywhere the mound is that tall.
    const y = H * (1 - Math.sqrt(1 - rank / N)) + (r() - 0.5) * 0.2
    const halfW = R * Math.sqrt(Math.max(0.02, 1 - y / H))
    pileAt.set(i, [(r() * 2 - 1) * halfW, y - 3.4, (r() - 0.5) * 2.4])
  })
  const pile = make((i, p, c) => {
    const q = pileAt.get(i)!
    p[0] = q[0]; p[1] = q[1]; p[2] = q[2]
    c.copy(groupColor[i])
    return 3
  }, front(V(0, 0.2, 0), [R + 1, 4.6], { dir: V(0, 0.18, 1).normalize() }))

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
  }, { target: V(0, 48, -88), dir: V(0, 0, 1), at: V(0, 0, 0), span: [0, 0], fov: narrow ? 70 : 58, ...side, oy: narrow ? 0.1 : 0 })

  // The path: every point lands on a step of the stair up the mountain (src/components/world/dioramas.ts).
  const pathF = make((i, p, c) => {
    p[0] = path.spots[i * 3]; p[1] = path.spots[i * 3 + 1]; p[2] = path.spots[i * 3 + 2]
    c.copy(groupColor[i])
    return 3
  }, front(V(0, 10, 0), [14, 14.5], { orbit: true, elev: 0.2, fov: 46, full: true, ox: narrow ? 0 : -0.1, oy: narrow ? 0.12 : 0, room: [1, 0.95] }))

  // The city: every point lands on a floor of the town it builds (src/components/world/dioramas.ts).
  const city = cityLayout(votes, 4, SEEDS)
  const cityF = make((i, p, c) => {
    p[0] = town.spots[i * 3]; p[1] = town.spots[i * 3 + 1]; p[2] = town.spots[i * 3 + 2]
    c.copy(groupColor[i]).lerp(C('#ffe2b0'), 0.35)
    return 2.6
  }, front(V(town.center[0], 1.5, town.center[1]), [town.reach * (narrow ? 0.72 : 1.0), town.reach * 0.62], { orbit: true, elev: 0.8, fov: 26, full: true, ox: narrow ? 0 : -0.08, oy: narrow ? 0.1 : 0, room: [1, 1] }))
  // Under the closing words: centred, a little lower, and further off.
  const endF: Formation = { ...cityF, pose: { ...cityF.pose, ox: 0, oy: narrow ? -0.12 : -0.1, span: [town.reach * 1.1, town.reach * 0.72] } }

  const labels = [
    ...WHY_IDENTITIES.map((name, g) => ({ text: name, color: colorOf(g, HUES), at: { identity: [centers[g][0], centers[g][1] - 2.6, 0] } as Record<string, number[]> })),
    { text: 'the everyday', color: '#cfc8b8', at: { identity: [0, everydayY - 1.6, 0] } as Record<string, number[]> },
    ...sky.labels.map((l) => ({ text: WHY_IDENTITIES[l.group], color: colorOf(l.group, HUES), at: { sky: squeeze(l.p) } as Record<string, number[]> })),
    ...'MTWTFSS'.split('').map((d, i) => ({ text: d, color: 'rgba(255,255,255,.55)', at: { week: [(i - 3) * dx, 5.6, 0] } as Record<string, number[]> })),
    ...path.labels.map((l) => ({ text: l.text, color: l.color, at: { path: l.at } as Record<string, number[]> })),
    ...city.labels.map((l) => ({ text: l.group < 0 ? 'the everyday' : WHY_IDENTITIES[l.group], color: l.group < 0 ? '#cfc8b8' : colorOf(l.group, HUES), at: { city: l.p } as Record<string, number[]> })),
  ]

  return {
    formations: [tick, evidence, identity, week, pile, skyF, pathF, cityF, endF],
    skyLines: sky.lines.flatMap(([a, b]) => [...skyAt[a], ...skyAt[b]]),
    skyLineColors: sky.lines.flatMap(([, b]) => { const c = groupColor[b]; return [c.r, c.g, c.b, c.r, c.g, c.b] }),
    labels,
  }
}

export function createWhyScene(canvas: HTMLCanvasElement, labelLayer: HTMLElement): WhyScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(BG)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  // The dark, with a faint cool glow in the middle, like the page around it.
  const bg = document.createElement('canvas')
  bg.width = bg.height = 256
  const bgx = bg.getContext('2d')!
  const grad = bgx.createRadialGradient(128, 116, 0, 128, 116, 150)
  grad.addColorStop(0, '#1d1e2b'); grad.addColorStop(1, BG)
  bgx.fillStyle = grad
  bgx.fillRect(0, 0, 256, 256)
  const bgTex = new THREE.CanvasTexture(bg)
  bgTex.colorSpace = THREE.SRGBColorSpace
  scene.background = bgTex
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let w = 1, h = 1, narrow = false, short = false
  // The two built worlds, made once: they do not change with the screen, only how they are framed.
  const path = mythicPath(demoVotes(), HUES)
  const town = toyTown(demoVotes(), HUES, SEEDS)
  scene.add(path.group, town.group)
  // Their skies: golden hour over the peaks, a bright cartoon day over the town. Faded in with each world.
  const sky = skyDome(BG)
  scene.add(sky)
  const fog = new THREE.Fog('#f2c4a4', 40, 160)
  let B = build(false, false, path, town)

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
  // Drawn last and through everything: points of light until they become a world.
  const points = new THREE.Points(geo, pointsMat)
  points.renderOrder = 2
  pointsMat.depthTest = false
  scene.add(points)

  // The sky's figures: lines between its bright stars.
  let extras = new THREE.Group()
  let skyLines: THREE.LineSegments
  const buildExtras = () => {
    scene.remove(extras)
    extras.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose() })
    extras = new THREE.Group()
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(B.skyLines, 3))
    lg.setAttribute('color', new THREE.Float32BufferAttribute(B.skyLineColors, 3))
    skyLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    extras.add(skyLines)
    scene.add(extras)
  }
  buildExtras()

  let labelEls: { el: HTMLElement; at: Record<string, THREE.Vector3> }[] = []
  const buildLabels = () => {
    labelLayer.replaceChildren()
    labelEls = B.labels.map((l) => {
      const el = document.createElement('div')
      el.textContent = l.text
      el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;opacity:0;color:${l.color};font-size:calc(13px * var(--why-k, 1) * var(--why-label, 1));font-weight:600;text-shadow:0 1px 10px rgba(0,0,0,.7)`
      labelLayer.appendChild(el)
      return { el, at: Object.fromEntries(Object.entries(l.at).map(([k, v]) => [k, new THREE.Vector3(v[0], v[1], v[2])])) }
    })
  }
  buildLabels()

  const resize = () => {
    const box = canvas.parentElement?.getBoundingClientRect()
    w = Math.max(1, Math.round(box?.width ?? 1)); h = Math.max(1, Math.round(box?.height ?? 1))
    renderer.setSize(w, h, false)
    composer?.setPixelRatio(renderer.getPixelRatio())
    composer?.setSize(w, h)
    camera.aspect = w / h
    // The same rule as the page's layout (StoryLanding, WhyStory).
    const n = w < 900 && w < h * 1.2, sh = !n && h < 560
    if (n !== narrow || sh !== short) { narrow = n; short = sh; B = build(narrow, short, path, town); buildExtras(); buildLabels() }
  }
  // Bloom, so what is lit — windows, lanterns, the shrine's beam, stars — glows rather than just being pale.
  const composer: EffectComposer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.72)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const ro = new ResizeObserver(resize)
  if (canvas.parentElement) ro.observe(canvas.parentElement)
  resize()

  let fT = 0, f = 0, enterT = 0, enter = 0
  const insetT = { top: 0, bottom: 0 }, inset = { top: 0, bottom: 0 }
  // The canvas is pinned over the whole screen, so it is always "visible": the page says when it is really in use.
  let running = false

  const v = new THREE.Vector3(), tgt = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3()
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
    inset.top += (insetT.top - inset.top) * follow
    inset.bottom += (insetT.bottom - inset.bottom) * follow

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
        // Loose evidence never sits still: each point circles at its own pace.
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
    // Points grow with a tall screen, as the words do (see stageScale in StoryLanding).
    pointsMat.uniforms.uPR.value = renderer.getPixelRatio() * Math.max(1, Math.min(2.2, h / 900))
    // Points of light until they reach a built world, and then they are it.
    const built = Math.max(weight(6), weight(7) + weight(8))
    pointsMat.uniforms.uOpacity.value = clamp(enter * 1.4) * (1 - Math.pow(built, 1.6))

    // The camera, between poses: each fitted to this screen, the city turning slowly on its own.
    // On a narrow screen the picture gets whatever the words leave, however long they run.
    const fitted = (P: Pose): Pose => {
      if (!narrow || P.full || inset.top + inset.bottom <= 0) return P
      const free = Math.max(h * 0.2, h - inset.top - inset.bottom)
      return { ...P, ox: 0, oy: 0.5 - (inset.top + free / 2) / h, room: [0.92, (free / h) * 0.94] }
    }
    const PA = fitted(A.pose), PB = fitted(Bf.pose)
    const place = (P: Pose, out: THREE.Vector3) => {
      if (P.at) return out.copy(P.at)
      const half = Math.tan((P.fov * Math.PI) / 360)
      const dist = Math.max(P.span[1] / (half * P.room[1]), P.span[0] / (half * camera.aspect * P.room[0]))
      const dir = P.orbit ? v.set(Math.sin(0.75 + t * 0.03), P.elev ?? 0.55, Math.cos(0.75 + t * 0.03)).normalize() : P.dir
      return out.copy(P.target).addScaledVector(dir, dist)
    }
    camera.position.copy(place(PA, pa)).lerp(place(PB, pb), k)
    tgt.copy(A.pose.target).lerp(Bf.pose.target, k)
    camera.lookAt(tgt)
    camera.fov = A.pose.fov + (Bf.pose.fov - A.pose.fov) * k
    const ox = PA.ox + (PB.ox - PA.ox) * k, oy = PA.oy + (PB.oy - PA.oy) * k
    camera.setViewOffset(w, h, ox * w, oy * h, w, h)
    camera.updateProjectionMatrix()

    ;(skyLines.material as THREE.LineBasicMaterial).opacity = weight(5) * 0.55
    skyLines.visible = weight(5) > 0.01
    // Each world rises out of the dark below as its points arrive, builds itself in the order
    // the votes were cast, and sinks away again when the next one comes.
    const rise = (world: WhyWorld, wt: number) => {
      world.group.visible = wt > 0.003
      if (!world.group.visible) return
      const e = 1 - Math.pow(1 - wt, 3)
      world.group.position.y = (1 - e) * -16
      world.grow(wt, t)
    }
    const wPath = weight(6), wTown = weight(7) + weight(8)
    rise(path, wPath)
    rise(town, wTown)
    // The worlds' skies and air: each fades in with its world, and the glow
    // is turned down by day, where there is less in the dark to light up.
    sky.visible = wPath + wTown > 0.003
    sky.position.copy(camera.position)
    const su = (sky.material as THREE.ShaderMaterial).uniforms
    su.uPath.value = wPath
    su.uTown.value = wTown
    if (wPath + wTown > 0.003) {
      fog.color.set(wPath >= wTown ? '#f2c4a4' : '#d3ecff')
      // Measured from the camera, which stands much further off on a phone held upright.
      const away = camera.position.distanceTo(tgt)
      fog.near = away * (wPath >= wTown ? 1.05 : 1.15)
      fog.far = away * (wPath >= wTown ? 3.4 : 3)
      scene.fog = fog
    } else scene.fog = null
    bloom.strength = 0.8 - 0.55 * wPath - 0.7 * wTown
    bloom.threshold = 0.72 + 0.14 * wPath + 0.22 * wTown

    composer.render()

    // Names shrink a little when the picture is squeezed small, so neighbours do not run together.
    const labelScale = narrow ? Math.max(0.72, Math.min(1, (h - inset.top - inset.bottom) / 320)) : 1
    labelLayer.style.setProperty('--why-label', String(labelScale))
    for (const l of labelEls) {
      let op = 0
      for (const [name, at] of Object.entries(l.at)) {
        const i = WHY_PHASES.indexOf(name as (typeof WHY_PHASES)[number])
        const wt = weight(i)
        if (wt <= op) continue
        v.copy(at).project(camera)
        if (v.z > 1) continue
        op = wt
        // Kept whole on screen: a name half off the edge of a phone reads as a bug.
        const half = l.el.offsetWidth / 2 + 8
        const x = Math.max(half, Math.min(w - half, (v.x * 0.5 + 0.5) * w))
        l.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`
      }
      l.el.style.opacity = String(clamp((op - 0.5) * 2))
    }
  }
  raf = requestAnimationFrame(loop)

  return {
    setProgress(nf, ne) { fT = nf; enterT = ne },
    setInsets(top, bottom) { insetT.top = top; insetT.bottom = bottom },
    setActive(on) { running = on },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      geo.dispose(); pointsMat.dispose()
      path.dispose(); town.dispose()
      extras.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose() })
      labelLayer.replaceChildren()
      composer.dispose(); bloom.dispose(); bgTex.dispose()
      renderer.dispose()
    },
  }
}
