import * as THREE from 'three'
import { colorOf, type Vote } from '@/lib/identity'
import { BLOCK, FLOOR_H, PITCH, cityLayout, rng } from '@/lib/world-layout'

/**
 * The landing page's path and town, built rather than dotted.
 *
 * In the second story the votes are points of light until they reach a
 * world, and then they become it: each point lands on a step of a stair that
 * spirals up a floating mountain to a lit shrine (the path, told as a myth —
 * every step a thing done, and today at the top), or on a floor of a toy
 * town that rises storey by storey (the city, as a cartoon). Both are
 * toon-shaded with ink outlines, and both float in the dark of the section,
 * so they need no sky of their own.
 *
 * Lit and finished the way the threejs-webgl skill (.claude/skills) lays
 * out: a key light with soft shadows, a cool fill, a rim light to pick the
 * shapes out of the dark, and bright things — windows, lanterns, the
 * shrine's beam, headlights — left above the bloom threshold in
 * why-scene.ts, so they glow.
 *
 * Each world reveals itself by `grow` (0–1): the steps are laid and the
 * floors built in the order the votes were cast, so scrolling in replays the
 * history. See why-scene.ts for how the points hand over to them.
 */

export interface WhyWorld {
  group: THREE.Group
  /** Where each vote ends up, in vote order: the point that becomes it flies here. */
  spots: Float32Array
  /** 0 → nothing yet, 1 → all of it. Cheap to call every frame. */
  grow(w: number, t: number): void
  /** Where a few names go. */
  labels: { text: string; color: string; at: [number, number, number] }[]
  dispose(): void
}

const C = (hex: string) => new THREE.Color(hex)
const INK = '#1b1a24'

/** Three flat tones, the cartoon look. A sunny cartoon wants lighter shadows: pass brighter tones. */
function toonRamp(tones: [number, number, number] = [90, 175, 255]) {
  const [a, b, c] = tones
  const t = new THREE.DataTexture(new Uint8Array([a, a, a, 255, b, b, b, 255, c, c, c, 255]), 3, 1, THREE.RGBAFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

/** A soft round glow, for lanterns, the shrine, fireflies and streetlights. */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function glows(at: number[], color: string, size: number, tex: THREE.Texture) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(at, 3))
  return new THREE.Points(g, new THREE.PointsMaterial({ map: tex, color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
}

/** Gives a mesh an ink outline — its back faces, a little larger, in black — that moves with it. */
function inked<T extends THREE.Mesh>(mesh: T, scale: number): T {
  const ink = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }))
  ink.scale.setScalar(scale)
  mesh.add(ink)
  return mesh
}

/**
 * Three-point light: a warm key that casts soft shadows over `span` around
 * `center`, a cool fill from the other side, and a rim light from behind.
 */
function rig(group: THREE.Group, { sky, ground, span, center = [0, 0] }: { sky: string; ground: string; span: number; center?: [number, number] }) {
  group.add(new THREE.HemisphereLight(sky, ground, 0.85))
  const key = new THREE.DirectionalLight('#ffe0b8', 1.9)
  key.position.set(center[0] + span * 0.9, span * 1.6, center[1] + span * 0.7)
  key.target.position.set(center[0], 0, center[1])
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const c = key.shadow.camera
  c.left = c.bottom = -span; c.right = c.top = span; c.near = 1; c.far = span * 5
  key.shadow.bias = -0.0006
  key.shadow.normalBias = 0.03
  key.shadow.radius = 3
  const fill = new THREE.DirectionalLight('#9fb4ff', 0.55)
  fill.position.set(center[0] - span, span * 0.6, center[1] - span * 0.4)
  const rim = new THREE.DirectionalLight('#c9b8ff', 1.3)
  rim.position.set(center[0] - span * 0.3, span * 0.8, center[1] - span * 1.4)
  group.add(key, key.target, fill, rim)
}

/** Casts and catches shadows. */
const shade = <T extends THREE.Object3D>(o: T, cast = true, receive = true): T => { o.castShadow = cast; o.receiveShadow = receive; return o }

/** A cloud: a few round puffs, toon-white, that drift. */
function cloud(toon: (c: string) => THREE.Material, r: () => number, color = '#8f88b3') {
  const g = new THREE.Group()
  const puff = new THREE.SphereGeometry(1, 14, 10)
  // Moonlit by default, not white: below the bloom threshold, so they read as cloud rather than light.
  const mat = toon(color)
  for (let i = 0; i < 4 + Math.floor(r() * 3); i++) {
    const m = new THREE.Mesh(puff, mat)
    const k = 0.7 + r() * 0.8
    m.scale.set(k * 1.3, k, k)
    m.position.set((i - 2) * 0.95 + r() * 0.4, r() * 0.5 + (i % 2) * 0.3, (r() - 0.5) * 0.8)
    g.add(m)
  }
  return g
}

/** Water falling off a cliff into the clouds, in moving streaks. */
function waterfall(width: number, height: number) {
  const geo = new THREE.PlaneGeometry(width, height, 1, 1)
  geo.translate(0, -height / 2, 0)
  return new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float streak = fract(vUv.y * 5.0 + uTime * 0.9 + sin(vUv.x * 23.0) * 0.25);
        vec3 c = mix(vec3(0.45, 0.78, 1.0), vec3(0.95, 0.99, 1.0), smoothstep(0.6, 1.0, streak));
        float a = edge * smoothstep(0.0, 0.55, vUv.y) * 0.9;
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  }))
}

const dispose = (group: THREE.Group) => group.traverse((o) => {
  const mesh = o as THREE.Mesh
  mesh.geometry?.dispose()
  const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
  if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
  else mat?.dispose()
})

// ── A sky for a world that fills the screen ──────────────────────────

/**
 * The worlds' painted sky: one dome, drawn behind everything, blending the
 * section's own dark with golden hour (for the peaks) and a bright
 * cartoon day (for the town) by how far each world has arrived — set `uPath` and `uTown`, 0–1.
 * Opaque, so the land in front of it is never covered; the scene keeps it
 * centred on the camera.
 */
export function skyDome(dark: string) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 40, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uDark: { value: C(dark) }, uPath: { value: 0 }, uTown: { value: 0 },
      uP: { value: [C('#6f90d2'), C('#f0ae86'), C('#ffd3a2')] },
      uT: { value: [C('#2f86ef'), C('#7cc0ff'), C('#d6efff')] },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uDark; uniform float uPath; uniform float uTown; uniform vec3 uP[3]; uniform vec3 uT[3]; varying vec3 vDir;
      vec3 grade(vec3 top, vec3 mid, vec3 horizon, float h) {
        return h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.85, h)) : mix(horizon, mid, smoothstep(-0.2, 0.12, h));
      }
      void main(){
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 c = uDark * clamp(1.0 - uPath - uTown, 0.0, 1.0) + grade(uP[0], uP[1], uP[2], h) * uPath + grade(uT[0], uT[1], uT[2], h) * uTown;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }))
  mesh.renderOrder = -2
  mesh.frustumCulled = false
  return mesh
}

// ── The path: a stair up a sky temple's peak ─────────────────────────

/*
 * Golden hour over a sea of cloud, in the manner of the airborne monasteries
 * of adventure cartoons: stone spires standing out of the clouds, round
 * towers with teal cone roofs and gold tips, wind curling between them.
 * The stair spirals up the tallest spire to the temple at its top — today.
 */
const R = 6.6, TOP = 3.1

/** A round tower with a cone roof and a gold tip. */
function tower(toon: (c: string) => THREE.Material, r: number, h: number) {
  const g = new THREE.Group()
  const wall = shade(inked(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 18), toon('#efe3cb')), 1.05))
  wall.position.y = h / 2
  const band = shade(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, h * 0.08, 18), toon('#e58a3a')))
  band.position.y = h * 0.82
  const roof = shade(inked(new THREE.Mesh(new THREE.ConeGeometry(r * 1.45, r * 1.9, 18), toon('#3f9cc4')), 1.05))
  roof.position.y = h + r * 0.95
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.8, 8), new THREE.MeshToonMaterial({ color: '#ffcf4d', emissive: '#6b4a00' }))
  tip.position.y = h + r * 1.9 + r * 0.35
  g.add(wall, band, roof, tip)
  return g
}

/** A stone spire standing out of the clouds, green on top. */
function spire(toon: (c: string) => THREE.Material, r: () => number, height: number, radius: number) {
  const prof: THREE.Vector2[] = []
  const base = -9
  for (let y = base; y <= height; y += 0.6) {
    const t = (y - base) / (height - base)
    prof.push(new THREE.Vector2(radius * (0.62 + 0.38 * Math.pow(1 - t, 1.4)) * (0.93 + r() * 0.12), y))
  }
  prof.push(new THREE.Vector2(0, height))
  const rockMat = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap })
  const rock = shade(inked(new THREE.Mesh(strata(new THREE.LatheGeometry(prof, 9), '#b3a28e', '#8c7a6a', height), rockMat), 1.025))
  const cap = shade(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.5, 9), toon('#86b86a')))
  cap.position.y = height + 0.1
  const g = new THREE.Group()
  g.add(rock, cap)
  return g
}

/** Paints sandstone strata onto a lathe: bands of lighter and darker rock up its height. */
function strata(geo: THREE.BufferGeometry, light: string, dark: string, seed: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const cols = new Float32Array(pos.count * 3), a = C(light), b = C(dark), c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const band = Math.sin(y * 1.9 + seed) * 0.5 + Math.sin(y * 4.3 + seed * 2.1) * 0.25
    c.copy(a).lerp(b, band > 0.15 ? 0.55 : band < -0.35 ? 0.25 : 0)
    cols.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return geo
}

export function mythicPath(votes: Vote[], hues: number[]): WhyWorld & { height: number } {
  const n = votes.length
  // As tall as the stair needs: a short climb for a few steps, a tower of a mountain for thousands.
  const H = Math.max(8, Math.min(60, n * 0.025))
  /** The spire's radius at a height: sheer sides, flaring a little at the foot. */
  const radiusAt = (y: number) => TOP + (R - TOP) * Math.pow(Math.max(0, 1 - y / H), 1.6)
  const group = new THREE.Group()
  const ramp = toonRamp(), glow = glowTexture()
  const toon = (color: string) => new THREE.MeshToonMaterial({ color, gradientMap: ramp })
  rig(group, { sky: '#ffd8b0', ground: '#6a5a7a', span: 20 })
  const r = rng(31)
  const unit3 = new THREE.BoxGeometry(1, 1, 1)

  // The main spire, with its green ledges, and the plateau the temple stands on.
  const prof: THREE.Vector2[] = []
  for (let y = -9; y <= H; y += 0.5) prof.push(new THREE.Vector2(radiusAt(Math.max(0, y)) * (y < 0 ? 1 + (-y / 9) * 0.25 : 1), y))
  prof.push(new THREE.Vector2(0, H))
  const peak = shade(inked(new THREE.Mesh(strata(new THREE.LatheGeometry(prof, 20), '#bfae98', '#93806e', 1.3), new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: ramp })), 1.015))
  const plateau = shade(new THREE.Mesh(new THREE.CylinderGeometry(TOP + 0.25, TOP, 0.5, 16), toon('#86b86a')))
  plateau.position.y = H + 0.05
  group.add(peak, plateau)

  // The stair: a step for every vote, laid oldest first from the clouds up,
  // a constant stride apart, spiralling to the temple.
  const spots = new Float32Array(n * 3)
  const stepGeo = new THREE.BoxGeometry(0.62, 0.16, 0.4)
  const steps = new THREE.InstancedMesh(stepGeo, toon('#ffffff'), Math.max(1, n))
  const stepInk = new THREE.InstancedMesh(stepGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), Math.max(1, n))
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3()
  const rise = (H - 0.6) / Math.max(1, n - 1)
  let theta = 0
  const trees: { x: number; y: number; z: number; g: number; k: number }[] = []
  const lanterns: number[] = []
  votes.forEach(([, g], i) => {
    const y = 0.2 + i * rise
    const rad = radiusAt(y) + 0.3
    const x = Math.cos(theta) * rad, z = Math.sin(theta) * rad
    spots.set([x, y + 0.12, z], i * 3)
    q.setFromEuler(e.set(0, -(theta + Math.PI / 2), 0))
    steps.setMatrixAt(i, m.compose(v.set(x, y, z), q, s.set(1, 1, 1)))
    stepInk.setMatrixAt(i, m.compose(v.set(x, y, z), q, s.set(1.1, 1.25, 1.16)))
    steps.setColorAt(i, C('#e3d8c6').lerp(C(colorOf(g, hues)), g < 0 ? 0 : 0.5))
    // Little trees on the ledges, in the colour of who planted them.
    if (i % 5 === 4 && y + 1 < H - 0.4) {
      const ty = y + 0.7 + r() * 0.4, tr = radiusAt(ty) + 0.15, ta = theta + (r() - 0.5) * 0.3
      trees.push({ x: Math.cos(ta) * tr, y: ty, z: Math.sin(ta) * tr, g, k: 0.5 + r() * 0.3 })
    }
    // A lantern every 25 steps, on the outer edge.
    if ((i + 1) % 25 === 0) lanterns.push(Math.cos(theta) * (rad + 0.45), y + 0.75, Math.sin(theta) * (rad + 0.45))
    theta += 0.5 / rad
  })
  group.add(stepInk, shade(steps))

  const crownGeo = new THREE.IcosahedronGeometry(0.42, 0), trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 5)
  const crowns = new THREE.InstancedMesh(crownGeo, toon('#ffffff'), Math.max(1, trees.length))
  const crownInk = new THREE.InstancedMesh(crownGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), Math.max(1, trees.length))
  const trunks = new THREE.InstancedMesh(trunkGeo, toon('#7a5238'), Math.max(1, trees.length))
  trees.forEach((t, i) => {
    trunks.setMatrixAt(i, m.compose(v.set(t.x, t.y + 0.2 * t.k, t.z), q.identity(), s.setScalar(t.k)))
    crowns.setMatrixAt(i, m.compose(v.set(t.x, t.y + 0.6 * t.k, t.z), q.setFromEuler(e.set(0, i, 0)), s.set(t.k, t.k * 1.25, t.k)))
    crownInk.setMatrixAt(i, m.compose(v.set(t.x, t.y + 0.6 * t.k, t.z), q, s.set(t.k * 1.14, t.k * 1.4, t.k * 1.14)))
    crowns.setColorAt(i, C(colorOf(t.g, hues)).lerp(C('#5f9e52'), t.g < 0 ? 0.8 : 0.35))
  })
  group.add(shade(trunks), crownInk, shade(crowns))

  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), toon('#5a3a2a'), Math.max(1, lanterns.length / 3))
  for (let i = 0; i < lanterns.length / 3; i++) posts.setMatrixAt(i, m.compose(v.set(lanterns[i * 3], lanterns[i * 3 + 1] - 0.4, lanterns[i * 3 + 2]), q.identity(), s.set(1, 1, 1)))
  const lanternGlow = glows(lanterns, '#ffb85c', 1.1, glow)
  group.add(shade(posts), lanternGlow)

  // The temple at the top: today. A tall tower and three small ones round it.
  const temple = new THREE.Group()
  const main = tower(toon, 1.0, 3.4)
  temple.add(main)
  for (let i = 0; i < 3; i++) {
    const t = tower(toon, 0.5, 1.9)
    const a = (i / 3) * Math.PI * 2 + 0.5
    t.position.set(Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1)
    temple.add(t)
  }
  temple.position.y = H + 0.3
  temple.add(glows([0, 6.4, 0], '#ffd27a', 3.4, glow))
  group.add(temple)

  // The other spires, standing out of the cloud, some with towers of their own.
  const spires: [number, number, number, number, boolean][] = [
    [-15, -6, 11, 3.2, true], [13, -10, 14, 3.6, true], [-9, -20, 18, 4.2, true], [20, 6, 8, 2.6, false],
    [-22, 9, 9, 3, false], [6, -26, 12, 3.4, true], [26, -18, 16, 4, false], [-28, -14, 13, 3.6, true],
  ]
  const pines: Item[] = [], pineTops: Item[] = [], collars: Item[] = []
  for (const [x, z, h, rad, towered] of spires) {
    const sp = spire(toon, r, h, rad)
    sp.position.set(x, 0, z)
    if (towered) { const t = tower(toon, 0.55, 1.8); t.position.y = h + 0.3; sp.add(t) }
    group.add(sp)
    // Pines on the cap, round the tower if there is one.
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = (towered ? 1.2 : 0.2) + r() * (rad * 0.66 - (towered ? 1.5 : 0.6)), k = 0.6 + r() * 0.5
      pines.push({ x: x + Math.cos(a) * d, y: h + 0.35 + 0.55 * k, z: z + Math.sin(a) * d, sx: 0.55 * k, sy: 1.1 * k, sz: 0.55 * k })
      pineTops.push({ x: x + Math.cos(a) * d, y: h + 0.35 + 1.2 * k, z: z + Math.sin(a) * d, sx: 0.38 * k, sy: 0.8 * k, sz: 0.38 * k })
    }
    // A collar of cloud round its foot.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r(), k = 1.4 + r() * 1.4
      collars.push({ x: x + Math.cos(a) * (rad * 0.85 + k * 0.6), y: -0.8 + r() * 1.2, z: z + Math.sin(a) * (rad * 0.85 + k * 0.6), sx: k * 1.5, sy: k * 0.7, sz: k })
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r(), k = 1.6 + r() * 1.6
    collars.push({ x: Math.cos(a) * (R + k * 0.5), y: -0.6 + r() * 1.2, z: Math.sin(a) * (R + k * 0.5), sx: k * 1.5, sy: k * 0.7, sz: k })
  }
  const cone = new THREE.ConeGeometry(1, 1, 7)
  group.add(instances(cone, toon('#3f7f4a'), pines, { ink: 0.06 }), instances(cone, toon('#4f9558'), pineTops))
  group.add(instances(new THREE.SphereGeometry(1, 14, 10), toon('#f6dcd6'), collars, { cast: false }))
  // A waterfall off the nearest of them, into the cloud.
  const fall = waterfall(1.6, 14)
  fall.position.set(-15 + 2.25, 10.9, -6 + 0.9)
  fall.rotation.y = Math.atan2(2.25, 0.9)
  group.add(fall)

  // The sea of cloud they stand in.
  const puffGeo = new THREE.SphereGeometry(1, 14, 10)
  const puffs = new THREE.InstancedMesh(puffGeo, toon('#f2d3cc'), 260)
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = 5 + Math.pow(r(), 0.7) * 75
    const k = 2.5 + r() * 4.5
    puffs.setMatrixAt(i, m.compose(v.set(Math.cos(a) * d, -2.6 + r() * 1.2, Math.sin(a) * d), q.identity(), s.set(k * 1.6, k * 0.55, k)))
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(240, 48), toon('#e5bfb8'))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -2.4
  group.add(shade(puffs, false), floor)

  // Wind, curling between the peaks.
  const swirls = Array.from({ length: 7 }, (_, i) => {
    const pts: number[] = []
    for (let j = 0; j <= 60; j++) {
      const t = j / 60, a = t * Math.PI * 3.2, rad = 0.4 + t * 1.6
      pts.push(t * 7 - 3.5 + Math.cos(a) * rad * 0.4, Math.sin(a) * rad * 0.5, Math.sin(a) * rad * 0.2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#fff7ee', transparent: true, opacity: 0.55, depthWrite: false }))
    line.userData = { a: (i / 7) * Math.PI * 2, d: 9 + r() * 12, y: 3 + r() * 12, sp: 0.05 + r() * 0.05 }
    group.add(line)
    return line
  })

  // Birds, in two loose flocks.
  const wing = new THREE.BufferGeometry()
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.18, -0.12, -0.12, 0, 0.1, 0, 0, 0, 0.5, 0.18, -0.12, 0.12, 0, 0.1], 3))
  wing.computeVertexNormals()
  const birdMat = new THREE.MeshBasicMaterial({ color: '#3d2c3e', side: THREE.DoubleSide })
  const birds = Array.from({ length: 12 }, (_, i) => {
    const b = new THREE.Mesh(wing, birdMat)
    b.userData = { flock: i < 6 ? 0 : 1, off: [(r() - 0.5) * 2.5, (r() - 0.5) * 1.2, (r() - 0.5) * 2.5], ph: r() * 6 }
    group.add(b)
    return b
  })

  // The sun, low behind the peaks.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }))
  sun.scale.setScalar(70)
  sun.position.set(-150, 18, -190)
  group.add(sun)

  // A railing of posts along the stair's outer edge, and grass in tufts on the ledges.
  const railPosts: Item[] = [], tufts: Item[] = []
  for (let i = 0; i < n; i += 2) {
    const x = spots[i * 3], y = spots[i * 3 + 1], z = spots[i * 3 + 2], rad = Math.hypot(x, z), out = (rad + 0.26) / rad
    railPosts.push({ x: x * out, y: y + 0.18, z: z * out, sx: 0.05, sy: 0.38, sz: 0.05 })
    if (i % 6 === 0) {
      const inn = (rad - 0.38) / rad
      tufts.push({ x: x * inn, y: y + 0.08, z: z * inn, sx: 0.16, sy: 0.3, sz: 0.16 })
    }
  }
  const railMesh = instances(unit3, toon('#6b4a33'), railPosts)
  const tuftMesh = instances(cone, toon('#6cae4f'), tufts, { cast: false })
  group.add(railMesh, tuftMesh)

  // The temple's courtyard: a low wall round the plateau, pillars, banners,
  // and strings of prayer flags from the tall tower to the small ones.
  const wall = shade(new THREE.Mesh(new THREE.CylinderGeometry(TOP + 0.15, TOP + 0.15, 0.45, 32, 1, true), new THREE.MeshToonMaterial({ color: '#e9dcc0', gradientMap: ramp, side: THREE.DoubleSide })))
  wall.position.y = 0.45
  temple.add(wall)
  temple.add(instances(unit3, toon('#c86a2e'), Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    return { x: Math.cos(a) * (TOP + 0.15), y: 0.6, z: Math.sin(a) * (TOP + 0.15), sx: 0.2, sy: 0.75, sz: 0.2 }
  }), { ink: 0.1 }))
  temple.add(instances(unit3, toon('#e8762e'), [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + 0.25
    return { x: Math.cos(a) * 1.04, y: 2.3, z: Math.sin(a) * 1.04, sx: 0.32, sy: 1.1, sz: 0.02, ry: -a + Math.PI / 2 }
  }), { cast: false }))
  const flagColors = ['#1c7ed6', '#f8f9fa', '#e03131', '#2f9e44', '#f59f00']
  const flags: Item[] = [], string: number[] = []
  for (let j = 0; j < 3; j++) {
    const a = (j / 3) * Math.PI * 2 + 0.5
    const from = new THREE.Vector3(0, 3.3, 0), to = new THREE.Vector3(Math.cos(a) * 2.1, 1.75, Math.sin(a) * 2.1)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, p = from.clone().lerp(to, t)
      p.y -= Math.sin(t * Math.PI) * 0.35
      if (i < 10) {
        const t1 = (i + 1) / 10, p1 = from.clone().lerp(to, t1)
        p1.y -= Math.sin(t1 * Math.PI) * 0.35
        string.push(p.x, p.y, p.z, p1.x, p1.y, p1.z)
      }
      if (i > 0 && i < 10) flags.push({ x: p.x, y: p.y - 0.13, z: p.z, sx: 0.2, sy: 0.24, sz: 0.02, ry: -a, color: flagColors[i % 5] })
    }
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.Float32BufferAttribute(string, 3))
  temple.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#4a3a2a' })), instances(unit3, toon('#ffffff'), flags, { cast: false }))

  // Paper lanterns, let go somewhere below, drifting up past the peaks.
  const skyLanterns = Array.from({ length: 18 }, () => ({ a: r() * Math.PI * 2, d: 7 + r() * 16, ph: r(), sp: 0.015 + r() * 0.02 }))
  const slGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.38, 8)
  const slMesh = new THREE.InstancedMesh(slGeo, new THREE.MeshBasicMaterial({ color: '#ffb35c' }), skyLanterns.length)
  const slPos = new Float32Array(skyLanterns.length * 3)
  const slGlow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(slPos, 3)), new THREE.PointsMaterial({ map: glow, color: '#ffc06e', size: 1.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  group.add(slMesh, slGlow)

  // Far mountains, blue in the haze.
  // Low, broad ranges with rounded shoulders rather than pyramids: a lathe with a soft profile.
  const rangeProf: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) { const t = i / 10; rangeProf.push(new THREE.Vector2(Math.cos(t * Math.PI / 2) * (1 - 0.15 * Math.sin(t * 9)), Math.pow(t, 0.8))) }
  group.add(instances(new THREE.LatheGeometry(rangeProf, 11), toon('#a3acc9'), Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + r() * 0.3, d = 160 + r() * 70, h = 24 + r() * 30
    return { x: Math.cos(a) * d, y: -8, z: Math.sin(a) * d, sx: 55 + r() * 35, sy: h, sz: 55 + r() * 35, ry: r() * 3 }
  }), { cast: false, receive: false }))

  const world: WhyWorld & { height: number } = {
    group, spots, height: H,
    labels: [{ text: 'today', color: '#fff3dc', at: [0, H + 6.6, 0] }],
    grow(w, t) {
      // Laid in the order they were taken; the trees and lanterns come with them.
      const shown = Math.round(n * Math.max(0, Math.min(1, (w - 0.15) / 0.8)))
      steps.count = stepInk.count = shown
      const k = shown / Math.max(1, n)
      crowns.count = crownInk.count = trunks.count = Math.floor(trees.length * k)
      posts.count = Math.floor((lanterns.length / 3) * k)
      lanternGlow.geometry.setDrawRange(0, posts.count)
      // With no steps yet there is nothing to climb, but the temple is still there to climb to.
      temple.visible = k > 0.9 || n === 0
      railMesh.children.forEach((c) => { (c as THREE.InstancedMesh).count = Math.floor(railPosts.length * k) })
      tuftMesh.children.forEach((c) => { (c as THREE.InstancedMesh).count = Math.floor(tufts.length * k) })
      skyLanterns.forEach((l, i) => {
        const u = (t * l.sp + l.ph) % 1, a = l.a + t * 0.02
        const x = Math.cos(a) * l.d, y = -2 + u * 30, z = Math.sin(a) * l.d
        slMesh.setMatrixAt(i, m.compose(v.set(x, y, z), q.identity(), s.setScalar(u < 0.08 ? u / 0.08 : u > 0.9 ? (1 - u) / 0.1 : 1)))
        slPos.set([x, y, z], i * 3)
      })
      slMesh.instanceMatrix.needsUpdate = true
      slGlow.geometry.attributes.position.needsUpdate = true
      for (const sw of swirls) {
        const u = sw.userData, a = u.a + t * u.sp
        sw.position.set(Math.cos(a) * u.d, u.y + Math.sin(t * 0.4 + u.a) * 0.6, Math.sin(a) * u.d)
        sw.rotation.y = -a
        ;(sw.material as THREE.LineBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 0.8 + u.a)
      }
      for (const b of birds) {
        const u = b.userData, fa = t * (u.flock ? 0.09 : 0.07) + (u.flock ? 2.5 : 0), fd = u.flock ? 24 : 17, fy = u.flock ? 18 : 13
        b.position.set(Math.cos(fa) * fd + u.off[0], fy + u.off[1] + Math.sin(t * 0.7 + u.ph) * 0.3, Math.sin(fa) * fd + u.off[2])
        b.rotation.y = -fa
        b.scale.set(0.6, 0.25 + Math.abs(Math.sin(t * 6 + u.ph)) * 0.7, 0.6)
      }
      ;(fall.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    },
    dispose() { dispose(group); ramp.dispose(); glow.dispose() },
  }
  world.grow(0, 0)
  return world
}

// ── The city: a sunny cartoon town ───────────────────────────────────

/** One placement of an instanced thing. */
interface Item { x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; ry?: number; color?: string }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3()

/** Many of one thing, in one draw: optionally with an ink outline `ink` larger. */
function instances(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], { cast = true, receive = true, ink = 0 } = {}) {
  const g = new THREE.Group()
  const make = (material: THREE.Material, grow: number) => {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length))
    mesh.count = items.length
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(0, it.ry ?? 0, 0))
      mesh.setMatrixAt(i, _m.compose(_v.set(it.x, it.y, it.z), _q, _s.set((it.sx ?? 1) * grow, (it.sy ?? 1) * grow, (it.sz ?? 1) * grow)))
      if (it.color && grow === 1) mesh.setColorAt(i, C(it.color))
    })
    return mesh
  }
  g.add(shade(make(mat, 1), cast, receive))
  if (ink) g.add(make(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 1 + ink))
  return g
}

/*
 * Springfield-ish: a bright blue sky full of fat white clouds, saturated
 * walls with fat black outlines, shops with striped awnings, a nuclear plant
 * steaming on the horizon and a donut the size of a car on a roof. The
 * town's middle is built from the votes, a storey each; the suburbs, the
 * roads out and the landmarks are scenery, there so it fills the screen.
 */
const WALLS = ['#f6b73c', '#6fb7e9', '#f08aa0', '#7fd6a1', '#b79be0', '#ff9a62', '#c6e36a', '#5fd3c4']
const HOUSES = ['#f7a8c4', '#f9c74f', '#b39ddb', '#90caf9', '#ffab91', '#a5d6a7', '#ffe082', '#f48fb1']
const ROOFS = ['#c4483e', '#7a5a9b', '#3f8f8a', '#8a5a3b', '#d9773a', '#4a6fb5']
const AWNINGS = ['#e5484d', '#2f9e44', '#1c7ed6', '#f59f00', '#ae3ec9']

export function toyTown(votes: Vote[], hues: number[], seeds: number[]): WhyWorld & { center: [number, number]; reach: number } {
  const group = new THREE.Group()
  const ramp = toonRamp([150, 210, 255]), glow = glowTexture()
  const toon = (color: string) => new THREE.MeshToonMaterial({ color, gradientMap: ramp })
  const city = cityLayout(votes, hues.length, seeds)
  const r = rng(53)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler()
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4)
  hip.rotateY(Math.PI / 4)

  const pads = [{ x: 0, z: 0, park: true }, ...city.blocks.map((b) => ({ x: b.x, z: b.z, park: false }))]
  const xs = pads.map((b) => b.x), zs = pads.map((b) => b.z)
  const x0 = Math.min(...xs) - BLOCK / 2 - 2.5, x1 = Math.max(...xs) + BLOCK / 2 + 2.5
  const z0 = Math.min(...zs) - BLOCK / 2 - 2.5, z1 = Math.max(...zs) + BLOCK / 2 + 2.5
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  const span = Math.max(x1 - x0, z1 - z0) / 2
  rig(group, { sky: '#e8f4ff', ground: '#7aa35a', span: span * 1.25, center: [cx, cz] })
  group.add(new THREE.AmbientLight('#ffffff', 0.35))

  // ── Ground: grass to the horizon, asphalt under the town, roads out of it.
  const grass = new THREE.Mesh(new THREE.CircleGeometry(300, 56), toon('#78c850'))
  grass.rotation.x = -Math.PI / 2
  grass.position.set(cx, -0.02, cz)
  group.add(shade(grass, false))
  const asphalt = '#6e7480', dash = '#f5d142'
  const roads: Item[] = [{ x: cx, y: 0.03, z: cz, sx: x1 - x0, sy: 0.06, sz: z1 - z0, color: asphalt }]
  const OUT = 140
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = OUT, mid = dx ? (dx > 0 ? x1 : x0) + (dx * len) / 2 : 0, midz = dz ? (dz > 0 ? z1 : z0) + (dz * len) / 2 : 0
    roads.push(dx ? { x: mid, y: 0.03, z: cz, sx: len, sy: 0.06, sz: 3.2, color: asphalt } : { x: cx, y: 0.03, z: midz, sx: 3.2, sy: 0.06, sz: len, color: asphalt })
  }
  group.add(instances(unit, toon('#ffffff'), roads, { cast: false }))

  // Yellow dashes down the middle of every street, in town and out of it.
  const dashes: Item[] = []
  const linesX = [...new Set(xs.flatMap((x) => [x - PITCH / 2, x + PITCH / 2]))], linesZ = [...new Set(zs.flatMap((z) => [z - PITCH / 2, z + PITCH / 2]))]
  for (const L of linesX) for (let z = z0 + 0.6; z < z1 - 0.6; z += 1.5) dashes.push({ x: L, y: 0.065, z, sx: 0.12, sy: 0.01, sz: 0.75 })
  for (const L of linesZ) for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.5) dashes.push({ x, y: 0.065, z: L, sx: 0.75, sy: 0.01, sz: 0.12 })
  for (let d = 1; d < OUT; d += 1.6) {
    dashes.push({ x: x1 + d, y: 0.065, z: cz, sx: 0.75, sy: 0.01, sz: 0.12 }, { x: x0 - d, y: 0.065, z: cz, sx: 0.75, sy: 0.01, sz: 0.12 })
    dashes.push({ x: cx, y: 0.065, z: z1 + d, sx: 0.12, sy: 0.01, sz: 0.75 }, { x: cx, y: 0.065, z: z0 - d, sx: 0.12, sy: 0.01, sz: 0.75 })
  }
  group.add(instances(unit, toon(dash), dashes, { cast: false }))

  // Blocks: a curb, the sidewalk on it; the park in the middle is lawn.
  group.add(instances(unit, toon('#b9b2a2'), pads.map((b) => ({ x: b.x, y: 0.09, z: b.z, sx: BLOCK + 0.3, sy: 0.16, sz: BLOCK + 0.3 })), { cast: false }))
  group.add(instances(unit, toon('#ffffff'), pads.map((b) => ({ x: b.x, y: 0.13, z: b.z, sx: BLOCK, sy: 0.2, sz: BLOCK, color: b.park ? '#7fcf63' : '#ece4d2' })), { cast: false }))

  // Street furniture on every block: lamps at the corners, a hydrant, two little trees.
  const lampPosts: Item[] = [], lampHeads: Item[] = [], hydrants: Item[] = [], smallTrees: Item[] = [], trunksS: Item[] = []
  for (const b of pads) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      lampPosts.push({ x: b.x + dx * 4.75, y: 0.95, z: b.z + dz * 4.75, sx: 0.08, sy: 1.6, sz: 0.08 })
      lampHeads.push({ x: b.x + dx * 4.75, y: 1.8, z: b.z + dz * 4.75, sx: 0.26, sy: 0.16, sz: 0.26 })
    }
    if (b.park) continue
    hydrants.push({ x: b.x + 4.78, y: 0.4, z: b.z + 1.2 })
    for (const dz of [-2.3, 2.3]) {
      trunksS.push({ x: b.x - 4.78, y: 0.55, z: b.z + dz, sx: 0.08, sy: 0.7, sz: 0.08 })
      smallTrees.push({ x: b.x - 4.78, y: 1.15, z: b.z + dz, sx: 0.42, sy: 0.48, sz: 0.42, color: r() < 0.5 ? '#3fa34d' : '#58b947' })
    }
  }
  group.add(instances(unit, toon('#2f4f3f'), lampPosts), instances(unit, toon('#fff1b8'), lampHeads))
  group.add(instances(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 8), toon('#e03131'), hydrants, { ink: 0.12 }))
  const ball = new THREE.SphereGeometry(1, 12, 10)
  group.add(instances(unit, toon('#7a5238'), trunksS), instances(ball, toon('#ffffff'), smallTrees, { ink: 0.08 }))

  // The park: crossing paths, a two-tier fountain, benches, round trees.
  group.add(instances(unit, toon('#ead9b0'), [{ x: 0, y: 0.24, z: 0, sx: BLOCK, sy: 0.02, sz: 1.1 }, { x: 0, y: 0.24, z: 0, sx: 1.1, sy: 0.02, sz: BLOCK }], { cast: false }))
  const basin = shade(inked(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.4, 24), toon('#d8dde6')), 1.04))
  basin.position.y = 0.43
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.05, 24), toon('#68c3f0'))
  water.position.y = 0.63
  const tier = shade(inked(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.9, 16), toon('#d8dde6')), 1.05))
  tier.position.y = 1.0
  group.add(basin, water, tier, glows([0, 1.6, 0], '#bfe9ff', 1.4, glow))
  group.add(instances(unit, toon('#a0522d'), [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * 2.6, y: 0.4, z: sz * 2.6, sx: 1.2, sy: 0.16, sz: 0.4, ry: sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4 }))), { ink: 0.1 }))
  const parkTrees: Item[] = [], parkTrunks: Item[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4, d = 3.4 + r() * 0.8, k = 0.7 + r() * 0.35
    parkTrunks.push({ x: Math.cos(a) * d, y: 0.6 * k, z: Math.sin(a) * d, sx: 0.16 * k, sy: 1.0 * k, sz: 0.16 * k })
    parkTrees.push({ x: Math.cos(a) * d, y: 1.45 * k, z: Math.sin(a) * d, sx: 0.85 * k, sy: 0.95 * k, sz: 0.85 * k, color: ['#3fa34d', '#58b947', '#2f8f3f'][i % 3] })
  }
  group.add(instances(unit, toon('#7a5238'), parkTrunks), instances(ball, toon('#ffffff'), parkTrees, { ink: 0.07 }))

  // ── The suburbs: pastel houses on lawns, picket fences, driveways.
  const lawns: Item[] = [], houses: Item[] = [], roofsH: Item[] = [], doors: Item[] = [], frames: Item[] = [], panes: Item[] = [], drives: Item[] = [], posts: Item[] = [], rails: Item[] = [], chimneys: Item[] = []
  const reach = span + 34
  const offRoad = (x: number, z: number) => Math.abs(x - cx) > 5 && Math.abs(z - cz) > 5
  let donutAt: [number, number] | null = null
  for (let gx = -8; gx <= 8; gx++) for (let gz = -8; gz <= 8; gz++) {
    const x = cx + gx * 8.5, z = cz + gz * 8.5
    const inTown = x > x0 - 6 && x < x1 + 6 && z > z0 - 6 && z < z1 + 6
    if (inTown || !offRoad(x, z) || Math.hypot(x - cx, z - cz) > reach + span * 0.4) continue
    if (!donutAt && x > x1 + 4 && Math.abs(z - cz) < 12) { donutAt = [x, z]; continue }
    if (r() < 0.12) continue
    const body = HOUSES[Math.floor(r() * HOUSES.length)], roof = ROOFS[Math.floor(r() * ROOFS.length)]
    const face = z > cz ? -1 : 1 // fronts face the town
    lawns.push({ x, y: 0.03, z, sx: 7.2, sy: 0.06, sz: 7.2, color: r() < 0.5 ? '#86d266' : '#7cc95c' })
    houses.push({ x, y: 0.9, z: z - face * 0.6, sx: 3.4, sy: 1.8, sz: 2.8, color: body })
    roofsH.push({ x, y: 2.35, z: z - face * 0.6, sx: 4.0, sy: 1.15, sz: 3.4, color: roof })
    if (r() < 0.5) chimneys.push({ x: x + 0.9, y: 2.6, z: z - face * 0.9, sx: 0.4, sy: 0.9, sz: 0.4 })
    doors.push({ x: x - 0.7, y: 0.5, z: z - face * 0.6 + face * 1.42, sx: 0.55, sy: 0.95, sz: 0.06 })
    for (const wx of [0.45, 1.2]) {
      frames.push({ x: x + wx, y: 1.05, z: z - face * 0.6 + face * 1.42, sx: 0.55, sy: 0.55, sz: 0.06 })
      panes.push({ x: x + wx, y: 1.05, z: z - face * 0.6 + face * 1.45, sx: 0.4, sy: 0.4, sz: 0.04 })
    }
    drives.push({ x: x + 2.4, y: 0.07, z: z + face * 1.9, sx: 1.4, sy: 0.04, sz: 3.2 })
    // A white picket fence along the front, with a gap for the path.
    for (let fx = -3.4; fx <= 3.4; fx += 0.5) if (Math.abs(fx + 0.7) > 0.5 && Math.abs(fx - 2.4) > 0.8) posts.push({ x: x + fx, y: 0.3, z: z + face * 3.45, sx: 0.08, sy: 0.6, sz: 0.08 })
    rails.push({ x: x - 2.15, y: 0.4, z: z + face * 3.45, sx: 2.5, sy: 0.07, sz: 0.05 }, { x: x + 0.85, y: 0.4, z: z + face * 3.45, sx: 1.9, sy: 0.07, sz: 0.05 }, { x: x + 3.25, y: 0.4, z: z + face * 3.45, sx: 0.3, sy: 0.07, sz: 0.05 })
  }
  group.add(instances(unit, toon('#ffffff'), lawns, { cast: false }))
  group.add(instances(unit, toon('#ffffff'), houses, { ink: 0.05 }), instances(hip, toon('#ffffff'), roofsH, { ink: 0.05 }), instances(unit, toon('#b0533c'), chimneys, { ink: 0.08 }))
  group.add(instances(unit, toon('#8a4b2a'), doors, { cast: false }), instances(unit, toon('#ffffff'), frames, { cast: false }), instances(unit, toon('#8fd0f0'), panes, { cast: false }))
  group.add(instances(unit, toon('#b8bcc4'), drives, { cast: false }), instances(unit, toon('#ffffff'), posts), instances(unit, toon('#ffffff'), rails))

  // Telephone poles down the roads out of town, wires sagging between them.
  const poles: Item[] = [], bars: Item[] = [], wire: number[] = []
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let prev: [number, number] | null = null
    for (let d = 3; d < 110; d += 9) {
      const x = dx ? (dx > 0 ? x1 : x0) + dx * d : cx + 2.3, z = dz ? (dz > 0 ? z1 : z0) + dz * d : cz + 2.3
      poles.push({ x, y: 2.2, z, sx: 0.14, sy: 4.4, sz: 0.14 })
      bars.push({ x, y: 4.1, z, sx: dx ? 0.12 : 1.2, sy: 0.1, sz: dx ? 1.2 : 0.12 })
      if (prev) for (const side of [-0.5, 0.5]) {
        const [px, pz] = prev
        for (let k = 0; k < 6; k++) {
          const t0 = k / 6, t1 = (k + 1) / 6, sag = (t: number) => 4.05 - Math.sin(t * Math.PI) * 0.45
          wire.push(px + (x - px) * t0 + (dx ? 0 : side), sag(t0), pz + (z - pz) * t0 + (dx ? side : 0), px + (x - px) * t1 + (dx ? 0 : side), sag(t1), pz + (z - pz) * t1 + (dx ? side : 0))
        }
      }
      prev = [x, z]
    }
  }
  group.add(instances(unit, toon('#7a5a3b'), poles), instances(unit, toon('#6a4a30'), bars))
  const wg = new THREE.BufferGeometry()
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3))
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2a2a' })))

  // ── Landmarks on the edge of town.
  // A nuclear plant, cooling towers steaming.
  const plant = new THREE.Group()
  const prof: THREE.Vector2[] = []
  for (let y = 0; y <= 12; y += 0.75) prof.push(new THREE.Vector2(2.6 + 0.045 * (y - 8) * (y - 8), y))
  const towerGeo = new THREE.LatheGeometry(prof, 28)
  const steam: THREE.Mesh[] = []
  const steamMat = toon('#f4f6f8')
  for (const [tx, tz] of [[0, 0], [7.5, 2]]) {
    const t = shade(inked(new THREE.Mesh(towerGeo, toon('#c9cfc1')), 1.03))
    t.position.set(tx, 0, tz)
    plant.add(t)
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(ball, steamMat)
      p.userData = { tx, tz, ph: i / 6 }
      steam.push(p)
      plant.add(p)
    }
  }
  const hall = shade(inked(new THREE.Mesh(unit, toon('#a7b0a0')), 1.04))
  hall.scale.set(9, 3, 5); hall.position.set(3.5, 1.5, 9)
  const stack = shade(inked(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 9, 12), toon('#b5463c')), 1.05))
  stack.position.set(7, 4.5, 10)
  plant.add(hall, stack)
  plant.position.set(cx + reach * 0.85, 0, cz - reach * 0.95)
  group.add(plant)

  // A donut shop, and the donut on its roof.
  if (donutAt) {
    const shop = new THREE.Group()
    const box = shade(inked(new THREE.Mesh(unit, toon('#f7c6d9')), 1.04))
    box.scale.set(4, 1.8, 3); box.position.y = 0.9
    const glass = new THREE.Mesh(unit, toon('#8fd0f0'))
    glass.scale.set(2.6, 0.9, 0.05); glass.position.set(0, 0.85, 1.53)
    const awning = shade(new THREE.Mesh(unit, toon('#e5484d')))
    awning.scale.set(3.2, 0.1, 0.8); awning.position.set(0, 1.55, 1.8); awning.rotation.x = 0.35
    const dough = shade(inked(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.5, 16, 36), toon('#d99a55')), 1.04))
    dough.position.y = 3.55
    const icing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.47, 16, 36), toon('#ff6fae'))
    icing.scale.z = 0.55; icing.position.set(0, 3.55, 0.12)
    const sprinkles: Item[] = []
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, rr = 1.15 + (r() - 0.5) * 0.55
      sprinkles.push({ x: Math.cos(a) * rr, y: 3.55 + Math.sin(a) * rr, z: 0.42, sx: 0.06, sy: 0.18, sz: 0.04, ry: 0, color: ['#ffe066', '#4dabf7', '#69db7c', '#ffffff', '#ff922b'][i % 5] })
    }
    const sprink = instances(unit, toon('#ffffff'), sprinkles, { cast: false })
    sprink.children.forEach((c) => { c.rotation.z = 0 })
    const legs = instances(unit, toon('#5a5a5a'), [{ x: -0.5, y: 2.3, z: 0, sx: 0.1, sy: 0.9, sz: 0.1 }, { x: 0.5, y: 2.3, z: 0, sx: 0.1, sy: 0.9, sz: 0.1 }])
    shop.add(box, glass, awning, dough, icing, sprink, legs)
    shop.position.set(donutAt[0], 0, donutAt[1])
    shop.rotation.y = -Math.PI / 2
    group.add(shop)
  }

  // A water tower, sky-blue, on long legs.
  const wt = new THREE.Group()
  const tank = shade(inked(new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 18), toon('#8fd3ff')), 1.04))
  tank.position.y = 8
  wt.add(tank, instances(unit, toon('#7a7f88'), [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]].map(([a, b]) => ({ x: a, y: 3.5, z: b, sx: 0.18, sy: 7, sz: 0.18 })), { ink: 0.1 }))
  wt.position.set(cx - reach * 0.75, 0, cz + reach * 0.8)
  group.add(wt)

  // A blimp, idling round the town.
  const blimp = new THREE.Group()
  const hull = shade(inked(new THREE.Mesh(ball, toon('#e9ecef')), 1.04), true, false)
  hull.scale.set(4.5, 1.4, 1.4)
  const gondola = shade(inked(new THREE.Mesh(unit, toon('#495057')), 1.08))
  gondola.scale.set(1.4, 0.45, 0.6); gondola.position.y = -1.55
  const stripe = new THREE.Mesh(ball, toon('#e5484d'))
  stripe.scale.set(1.2, 1.42, 1.42)
  blimp.add(hull, gondola, stripe, instances(unit, toon('#adb5bd'), [{ x: -4, y: 0.9, z: 0, sx: 1.2, sy: 1.2, sz: 0.12 }, { x: -4, y: 0, z: 0, sx: 1.2, sy: 0.12, sz: 2.6 }], { ink: 0.08 }))
  group.add(blimp)

  // Fat white clouds in a blue sky.
  const clouds = Array.from({ length: 9 }, (_, i) => {
    const c = cloud(toon, r, '#ffffff')
    c.userData = { a: (i / 9) * Math.PI * 2 + r(), d: reach + 30 + r() * 50, y: 26 + r() * 22 }
    c.scale.setScalar(4 + r() * 3)
    group.add(c)
    return c
  })

  // ── The town itself: a storey a vote, in bright walls with fat outlines.
  const n = city.floors.length
  const levelOf = city.floors.map((f) => Math.round(f.p[1] / FLOOR_H - 0.5))
  const wallOf = (g: number) => (g < 0 ? '#efd9a8' : C(WALLS[(hues[g] ?? g) % WALLS.length]).getHexString())
  const floors = new THREE.InstancedMesh(unit, toon('#ffffff'), Math.max(1, n))
  const bands = new THREE.InstancedMesh(unit, toon('#ffffff'), Math.max(1, n))
  city.floors.forEach((f, i) => {
    floors.setMatrixAt(i, m.compose(v.set(f.p[0], f.p[1] + 0.22, f.p[2]), q, s.set(f.w, FLOOR_H, f.d)))
    const wall = C(f.group < 0 ? '#efd9a8' : '#' + wallOf(f.group))
    floors.setColorAt(i, wall)
    bands.setMatrixAt(i, m.compose(v.set(f.p[0], f.p[1] + 0.22 + FLOOR_H / 2 - 0.03, f.p[2]), q, s.set(f.w + 0.08, 0.06, f.d + 0.08)))
    bands.setColorAt(i, wall.clone().lerp(C('#000000'), 0.28))
  })

  // Windows in white frames on every wall; on the street side of the ground
  // floor, a shop window under a striped awning instead.
  const frameItems: Item[] = [], paneItems: Item[] = [], awnItems: Item[] = [], winPer: number[] = [], awnPer: number[] = []
  city.floors.forEach((f, i) => {
    let wc = 0, ac = 0
    const y = f.p[1] + 0.24, shop = levelOf[i] === 0
    for (const side of [0, 1, 2, 3]) {
      const along = side % 2 === 0 ? f.w : f.d
      const out = (side % 2 === 0 ? f.d : f.w) / 2
      const place = (off: number, o: number) => side === 0 ? [f.p[0] + off, f.p[2] + o] : side === 2 ? [f.p[0] - off, f.p[2] - o] : side === 1 ? [f.p[0] + o, f.p[2] + off] : [f.p[0] - o, f.p[2] - off]
      const ry = side % 2 === 0 ? 0 : Math.PI / 2
      if (shop && side === 0) {
        const [x, z] = place(0, out + 0.02)
        frameItems.push({ x, y: y - 0.02, z, sx: along * 0.8, sy: 0.3, sz: 0.04, ry })
        paneItems.push({ x, y: y - 0.02, z: z + 0.015, sx: along * 0.72, sy: 0.24, sz: 0.04, ry })
        const [ax, az] = place(0, out + 0.18)
        awnItems.push({ x: ax, y: y + 0.17, z: az, sx: along * 0.86, sy: 0.05, sz: 0.34, ry, color: AWNINGS[(f.building + i) % AWNINGS.length] })
        wc++; ac++
        continue
      }
      const k = Math.max(1, Math.floor(along / 0.6))
      for (let j = 0; j < k; j++) {
        const off = ((j + 0.5) / k - 0.5) * along
        const [x, z] = place(off, out + 0.02)
        const [px, pz] = place(off, out + 0.035)
        frameItems.push({ x, y, z, sx: 0.28, sy: 0.24, sz: 0.04, ry })
        paneItems.push({ x: px, y, z: pz, sx: 0.2, sy: 0.17, sz: 0.04, ry })
        wc++
      }
    }
    winPer.push(wc); awnPer.push(ac)
  })
  const cumW = [0], cumA = [0]
  winPer.forEach((c) => cumW.push(cumW[cumW.length - 1] + c))
  awnPer.forEach((c) => cumA.push(cumA[cumA.length - 1] + c))
  const frameMesh = instances(unit, toon('#fbfbf5'), frameItems, { cast: false }).children[0] as THREE.InstancedMesh
  const paneMesh = instances(unit, toon('#86c9ec'), paneItems, { cast: false }).children[0] as THREE.InstancedMesh
  const awnMesh = instances(unit, toon('#ffffff'), awnItems, { cast: true }).children[0] as THREE.InstancedMesh
  awnMesh.rotation.set(0, 0, 0)

  // Per building, following its height as it rises: an ink outline; a house
  // roof while it is short, and once it is tall a flat roof with a parapet
  // and something on it — a water tank, an air-conditioning box or a mast.
  const buildingOf = city.floors.map((f) => f.building)
  const nb = Math.max(...buildingOf, -1) + 1
  const foot = new Map<number, (typeof city.floors)[number]>()
  for (const f of city.floors) if (!foot.has(f.building)) foot.set(f.building, f)
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
  const cap = Math.max(1, nb)
  const outlines = new THREE.InstancedMesh(unit, ink, cap)
  const hipRoofs = shade(new THREE.InstancedMesh(hip, toon('#ffffff'), cap)), hipInk = new THREE.InstancedMesh(hip, ink, cap)
  const parapets = shade(new THREE.InstancedMesh(unit, toon('#ffffff'), cap))
  const tanks = shade(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.6, 12), toon('#8a5a3b'), cap))
  const tankTops = shade(new THREE.InstancedMesh(new THREE.ConeGeometry(0.38, 0.3, 12), toon('#6b4226'), cap))
  const acs = shade(new THREE.InstancedMesh(unit, toon('#adb5bd'), cap))
  const masts = shade(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6), toon('#495057'), cap))
  for (let i = 0; i < cap; i++) { hipRoofs.setColorAt(i, C('#ffffff')); parapets.setColorAt(i, C('#ffffff')) }
  group.add(shade(floors), shade(bands), frameMesh, paneMesh, awnMesh, outlines, hipInk, hipRoofs, parapets, tanks, tankTops, acs, masts)

  // ── Traffic: little round cars, in bright colours.
  const lanesX = [...new Set(xs.flatMap((x) => [x - (BLOCK / 2 + 1.5), x + (BLOCK / 2 + 1.5)]))]
  const lanesZ = [...new Set(zs.flatMap((z) => [z - (BLOCK / 2 + 1.5), z + (BLOCK / 2 + 1.5)]))]
  const cars = Array.from({ length: Math.min(18, 8 + city.blocks.length * 2) }, (_, i) => {
    const alongX = i % 2 === 0
    const lanes = alongX ? lanesZ : lanesX
    return { alongX, at: lanes[Math.floor(r() * lanes.length)] + (r() < 0.5 ? -0.45 : 0.45), dir: r() < 0.5 ? -1 : 1, off: r(), speed: 1.4 + r() * 1.2 }
  })
  const bodyGeo = new THREE.BoxGeometry(0.95, 0.34, 0.52), cabGeo = new THREE.BoxGeometry(0.52, 0.28, 0.46)
  const bodies = shade(new THREE.InstancedMesh(bodyGeo, toon('#ffffff'), cars.length)), cabs = shade(new THREE.InstancedMesh(cabGeo, toon('#cfe9f7'), cars.length))
  const carInk = new THREE.InstancedMesh(bodyGeo, ink, cars.length)
  const carColors = ['#e5484d', '#f59f00', '#1c7ed6', '#2f9e44', '#e64980', '#7048e8', '#f08c00']
  cars.forEach((_, i) => bodies.setColorAt(i, C(carColors[i % carColors.length])))
  group.add(bodies, cabs, carInk)

  const spots = new Float32Array(n * 3)
  city.floors.forEach((f, i) => spots.set([f.p[0], f.p[1] + 0.22, f.p[2]], i * 3))

  let shownBefore = -1
  const tops = new Float32Array(nb)
  const world: WhyWorld & { center: [number, number]; reach: number } = {
    group, spots,
    center: [cx, cz],
    reach: span,
    labels: [],
    grow(w: number, t = 0) {
      // Life on the streets, and over them.
      const half = span - 0.6
      cars.forEach((car, i) => {
        const d = ((car.off * 2 * half + t * car.speed * car.dir) % (2 * half) + 2 * half) % (2 * half) - half
        const x = car.alongX ? cx + d : car.at, z = car.alongX ? car.at : cz + d
        q.setFromEuler(e.set(0, car.alongX ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0))
        bodies.setMatrixAt(i, m.compose(v.set(x, 0.33, z), q, s.set(1, 1, 1)))
        carInk.setMatrixAt(i, m.compose(v.set(x, 0.33, z), q, s.set(1.08, 1.15, 1.1)))
        cabs.setMatrixAt(i, m.compose(v.set(x - (car.alongX ? 0.08 * car.dir : 0), 0.62, z - (car.alongX ? 0 : 0.08 * car.dir)), q, s.set(1, 1, 1)))
      })
      q.identity()
      bodies.instanceMatrix.needsUpdate = cabs.instanceMatrix.needsUpdate = carInk.instanceMatrix.needsUpdate = true
      const ba = t * 0.04
      // Out over the suburbs, never between the camera and the streets.
      blimp.position.set(cx + Math.cos(ba) * (span + 42), 26 + Math.sin(t * 0.4) * 0.6, cz + Math.sin(ba) * (span + 42))
      blimp.rotation.y = -ba - Math.PI / 2
      for (const c of clouds) {
        const a = c.userData.a + t * 0.01
        c.position.set(cx + Math.cos(a) * c.userData.d, c.userData.y, cz + Math.sin(a) * c.userData.d)
      }
      for (const p of steam) {
        const u = (t * 0.12 + p.userData.ph) % 1
        p.position.set(p.userData.tx + Math.sin(u * 5) * 0.6, 12 + u * 9, p.userData.tz)
        p.scale.setScalar(1.6 + u * 3.2)
      }
      // Built in the order the votes were cast: storey by storey, roof always on top.
      const shown = Math.round(n * Math.max(0, Math.min(1, (w - 0.15) / 0.8)))
      if (shown === shownBefore) return
      shownBefore = shown
      floors.count = bands.count = shown
      frameMesh.count = paneMesh.count = cumW[shown]
      awnMesh.count = cumA[shown]
      tops.fill(0)
      const levels = new Int32Array(nb)
      for (let i = 0; i < shown; i++) {
        tops[buildingOf[i]] = Math.max(tops[buildingOf[i]], city.floors[i].p[1] + FLOOR_H / 2 + 0.22)
        levels[buildingOf[i]] = Math.max(levels[buildingOf[i]], levelOf[i] + 1)
      }
      let k = 0, kh = 0, kp = 0, kt = 0, ka = 0, km = 0
      for (const [b, f] of foot) {
        if (!tops[b]) continue
        const top = tops[b], wall = C(f.group < 0 ? '#efd9a8' : '#' + wallOf(f.group))
        outlines.setMatrixAt(k++, m.compose(v.set(f.p[0], top / 2 + 0.05, f.p[2]), q, s.set(f.w + 0.12, top + 0.1, f.d + 0.12)))
        if (levels[b] <= 3) {
          hipRoofs.setMatrixAt(kh, m.compose(v.set(f.p[0], top + 0.4, f.p[2]), q, s.set(f.w * 1.12, 0.8, f.d * 1.12)))
          hipInk.setMatrixAt(kh, m.compose(v.set(f.p[0], top + 0.4, f.p[2]), q, s.set(f.w * 1.2, 0.9, f.d * 1.2)))
          hipRoofs.setColorAt(kh++, C(ROOFS[b % ROOFS.length]))
        } else {
          parapets.setMatrixAt(kp, m.compose(v.set(f.p[0], top + 0.06, f.p[2]), q, s.set(f.w + 0.1, 0.14, f.d + 0.1)))
          parapets.setColorAt(kp++, wall.clone().lerp(C('#000000'), 0.32))
          const kind = b % 3
          if (kind === 0) {
            tanks.setMatrixAt(kt, m.compose(v.set(f.p[0] + f.w * 0.2, top + 0.45, f.p[2] - f.d * 0.15), q, s.set(1, 1, 1)))
            tankTops.setMatrixAt(kt++, m.compose(v.set(f.p[0] + f.w * 0.2, top + 0.9, f.p[2] - f.d * 0.15), q, s.set(1, 1, 1)))
          } else if (kind === 1) acs.setMatrixAt(ka++, m.compose(v.set(f.p[0] - f.w * 0.15, top + 0.25, f.p[2] + f.d * 0.1), q, s.set(0.6, 0.35, 0.45)))
          else masts.setMatrixAt(km++, m.compose(v.set(f.p[0], top + 0.8, f.p[2]), q, s.set(1, 1, 1)))
        }
      }
      outlines.count = k; hipRoofs.count = hipInk.count = kh; parapets.count = kp; tanks.count = tankTops.count = kt; acs.count = ka; masts.count = km
      for (const im of [outlines, hipRoofs, hipInk, parapets, tanks, tankTops, acs, masts]) im.instanceMatrix.needsUpdate = true
      for (const im of [hipRoofs, parapets]) if (im.instanceColor) im.instanceColor.needsUpdate = true
    },
    dispose() { dispose(group); ramp.dispose(); glow.dispose() },
  }
  world.grow(0, 0)
  return world
}
