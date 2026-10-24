import * as THREE from 'three'
import { colorOf, type WorldKind, type WorldPayload } from '@/lib/identity'
import { SKY_R, cityLayout, rng, skyLayout } from '@/lib/world-layout'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mythicPath, skyDome as paintedSky, toyTown } from './dioramas'

/**
 * The world, drawn: one three.js scene for whichever of the three the user
 * chose, built from the layouts in src/lib/world-layout.ts.
 *
 * Imperative on purpose and loaded on demand (see WorldCanvas.tsx): three.js
 * is the heaviest thing in the app, and nobody who keeps the world switched
 * off should download a byte of it.
 *
 * Each world keeps its own time of day — the sky at night, the path at
 * golden hour, the town on a bright cartoon afternoon — rather than
 * following light or dark mode: they are places, and places have their own
 * light. The path and the town are the same builds the landing page shows
 * (dioramas.ts), here made from the user's own votes.
 */

export interface WorldScene {
  show(kind: WorldKind, data: WorldPayload): void
  /** Kept for callers; the spiral path needs no walking back — drag and zoom instead. */
  lookBack(t: number): void
  /** How much of the right edge and the bottom the page's own panels cover, in px: the world is framed in the rest. */
  setInsets(right: number, bottom: number): void
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
  frame: (t: number, cam: THREE.PerspectiveCamera, yaw: number, pitch: number, zoom: number) => void
  fog?: THREE.Fog
  lookBack?: (t: number) => void
  /** How it is drawn: tone mapping, and how much the bright things glow. */
  look: { toneMapping: THREE.ToneMapping; bloom: number; threshold: number }
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
    look: { toneMapping: THREE.ACESFilmicToneMapping, bloom: 0.75, threshold: 0.6 },
    frame: (t, cam, yaw, pitch, zoom) => {
      // Zooming into a sky is narrowing the lens.
      cam.fov = Math.max(24, Math.min(90, (cam.aspect < 0.75 ? 66 : 58) * zoom))
      const drift = still ? 0 : Math.sin(t * 0.04) * 0.05
      const az = yaw + drift, el = 0.42 + pitch
      cam.position.set(0, 0, 0)
      look.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(SKY_R)
      cam.lookAt(look)
    },
  }
}

/** How far back to stand so a box `rx` wide and `ry` tall around the target fits the screen. */
function fit(cam: THREE.PerspectiveCamera, rx: number, ry: number) {
  const half = Math.tan((cam.fov * Math.PI) / 360)
  // The share of the screen left free by the page's panels (see setInsets).
  const [fw, fh] = (cam.userData.room as [number, number] | undefined) ?? [1, 1]
  return Math.max(ry / (half * fh), rx / (half * cam.aspect * fw))
}

// ── Path: a stair up a sky temple's peak ─────────────────────────────

function buildPath(data: WorldPayload, hues: number[], still: boolean): Built {
  const world = mythicPath(data.votes, hues)
  world.grow(1, 0)
  const group = new THREE.Group()
  const sky = paintedSky('#141413')
  ;(sky.material as THREE.ShaderMaterial).uniforms.uPath.value = 1
  sky.userData.follow = 'xyz'
  group.add(sky, world.group)
  const fog = new THREE.Fog('#f2c4a4', 60, 220)
  const H = world.height, target = new THREE.Vector3(0, H * 0.55, 0)
  return {
    group, fog,
    labels: world.labels.map((l) => ({ text: l.text, color: l.color, at: new THREE.Vector3(...l.at), small: true })),
    look: { toneMapping: THREE.NoToneMapping, bloom: 0.25, threshold: 0.86 },
    frame: (t, cam, yaw, pitch, zoom) => {
      world.grow(1, still ? 0 : t)
      cam.fov = 46
      const dist = fit(cam, 15, H * 0.55 + 9) * zoom
      const a = 0.75 + (still ? 0 : t * 0.02) + yaw, el = Math.max(-0.05, Math.min(1.2, 0.22 + pitch))
      cam.position.set(Math.sin(a) * dist * Math.cos(el), target.y + Math.sin(el) * dist, Math.cos(a) * dist * Math.cos(el))
      cam.lookAt(target)
      fog.near = dist * 1.05; fog.far = dist * 3.4
    },
  }
}

// ── City: a sunny cartoon town ───────────────────────────────────────

function buildCity(data: WorldPayload, hues: number[], seeds: number[], still: boolean): Built {
  const world = toyTown(data.votes, hues, seeds)
  world.grow(1, 0)
  const group = new THREE.Group()
  const sky = paintedSky('#141413')
  ;(sky.material as THREE.ShaderMaterial).uniforms.uTown.value = 1
  sky.userData.follow = 'xyz'
  group.add(sky, world.group)
  const fog = new THREE.Fog('#d3ecff', 60, 220)
  const [cx, cz] = world.center, reach = Math.max(12, world.reach)
  const target = new THREE.Vector3(cx, 1.5, cz)
  const names = cityLayout(data.votes, hues.length, seeds).labels
  return {
    group, fog,
    labels: names.map((l) => ({
      text: l.group < 0 ? 'The everyday' : data.identities[l.group]?.name ?? '',
      color: l.group < 0 ? '#ffffff' : colorOf(l.group, hues),
      at: new THREE.Vector3(...l.p),
    })),
    look: { toneMapping: THREE.NoToneMapping, bloom: 0.1, threshold: 0.94 },
    frame: (t, cam, yaw, pitch, zoom) => {
      world.grow(1, still ? 0 : t)
      cam.fov = 26
      const dist = fit(cam, reach, reach * 0.62) * zoom
      const a = 0.75 + (still ? 0 : t * 0.02) + yaw, el = Math.max(0.12, Math.min(1.35, 0.68 + pitch))
      cam.position.set(cx + Math.sin(a) * dist * Math.cos(el), target.y + Math.sin(el) * dist, cz + Math.cos(a) * dist * Math.cos(el))
      cam.lookAt(target)
      fog.near = dist * 1.15; fog.far = dist * 3
    },
  }
}

// ── The scene ─────────────────────────────────────────────────────────

export function createWorldScene(canvas: HTMLCanvasElement, labelLayer: HTMLElement): WorldScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    composer?.setPixelRatio(renderer.getPixelRatio())
    composer?.setSize(w, h)
    camera.aspect = w / h
    camera.fov = w < 560 ? 66 : 58
    camera.updateProjectionMatrix()
  }
  // Glow on what is lit — stars, lanterns, windows — as the landing page does.
  const composer: EffectComposer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.75)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const ro = new ResizeObserver(resize)
  if (canvas.parentElement) ro.observe(canvas.parentElement)
  resize()

  // Drag to turn round it, scroll or pinch to come closer. The turn drifts
  // back a little when let go; how close you came stays.
  const insetT = { right: 0, bottom: 0 }, inset = { right: 0, bottom: 0 }
  let yaw = 0, pitch = 0, yawT = 0, pitchT = 0, zoom = 1, zoomT = 1, dragging: { x: number; y: number } | null = null
  const touches = new Map<number, { x: number; y: number }>()
  let pinch = 0
  const down = (e: PointerEvent) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)
    if (touches.size === 1) dragging = { x: e.clientX, y: e.clientY }
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); dragging = null }
  }
  const move = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) zoomT = Math.max(0.4, Math.min(1.8, zoomT * (pinch / d)))
      pinch = d
      return
    }
    if (!dragging) return
    yawT -= (e.clientX - dragging.x) * 0.005
    pitchT = Math.max(-0.5, Math.min(0.6, pitchT + (e.clientY - dragging.y) * 0.003))
    dragging = { x: e.clientX, y: e.clientY }
  }
  const up = (e: PointerEvent) => { touches.delete(e.pointerId); pinch = 0; dragging = null }
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoomT = Math.max(0.4, Math.min(1.8, zoomT * Math.exp(e.deltaY * 0.0012))) }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', wheel, { passive: false })

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
    zoom += (zoomT - zoom) * follow
    inset.right += (insetT.right - inset.right) * follow
    inset.bottom += (insetT.bottom - inset.bottom) * follow
    if (!dragging) { yawT *= Math.exp(-dt * 0.15); pitchT *= Math.exp(-dt * 0.4) }
    // Framed in what the panels leave, and centred there.
    camera.userData.room = [Math.max(0.3, (w - inset.right) / w), Math.max(0.3, (h - inset.bottom) / h)]
    built.frame(t, camera, yaw, pitch, zoom)
    camera.setViewOffset(w, h, inset.right / 2, inset.bottom / 2, w, h)
    camera.updateProjectionMatrix()
    for (const o of built.group.children) {
      if (o.userData.follow === 'xyz') o.position.copy(camera.position)
      else if (o.userData.follow === 'xz') o.position.set(camera.position.x, 0, camera.position.z)
    }
    const scale = renderer.getPixelRatio() * h / (2 * Math.tan((camera.fov * Math.PI) / 360))
    built.group.traverse((o) => {
      const mat = (o as THREE.Points).material as THREE.ShaderMaterial | undefined
      // Not every shader has all three: the waterfall only keeps time.
      const u = mat?.uniforms
      if (u?.uTime) u.uTime.value = still ? 0 : t
      if (u?.uPR) u.uPR.value = renderer.getPixelRatio()
      if (u?.uScale) u.uScale.value = scale
    })
    composer.render()
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
      built = kind === 'sky' ? buildSky(data, hues, seeds, still) : kind === 'path' ? buildPath(data, hues, still) : buildCity(data, hues, seeds, still)
      scene.add(built.group)
      scene.fog = built.fog ?? null
      renderer.toneMapping = built.look.toneMapping
      bloom.strength = built.look.bloom
      bloom.threshold = built.look.threshold
      yaw = yawT = pitch = pitchT = 0
      zoom = zoomT = 1
      labels = built.labels.map((l) => {
        const el = document.createElement('div')
        el.textContent = l.text
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .3s;color:${l.color};font-size:${l.small ? 11 : 12.5}px;font-weight:600;letter-spacing:.01em;text-shadow:0 1px 8px rgba(0,0,0,.65)`
        labelLayer.appendChild(el)
        return { el, at: l.at, far: l.far }
      })
    },
    lookBack(t) { built?.lookBack?.(t) },
    setInsets(right, bottom) { insetT.right = right; insetT.bottom = bottom },
    dispose() {
      cancelAnimationFrame(raf)
      clear()
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      composer.dispose(); bloom.dispose()
      renderer.dispose()
    },
  }
}
