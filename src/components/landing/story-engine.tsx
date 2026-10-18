/*
 * The landing page's story, as numbers: given how far the page has scrolled
 * and how far the intro has run, where everything is and what it shows.
 *
 * Ported from the Claude Design file "Acture Landing v4" — the timeline,
 * poses, easing and copy are the design's own. Pure on purpose: one function
 * in, one description of the frame out, so the component (StoryLanding.tsx)
 * only draws what this decides.
 */
import type { CSSProperties, ReactNode } from 'react'

// ── What is said in the story ─────────────────────────────────────────
export const SAID = 'lab report due thursday, call the bank at 1, pick up printer ink, and remind me to call mom tonight'
export const CI_SAY = 'Went for a walk at seven instead of the gym. Didn’t get to the ML notes, I’ll do them tomorrow morning.'

// ── Icons (lucide's paths, drawn here so the story needs nothing else) ─
type Shape = [string, Record<string, string | number>]
const P: Record<string, Shape[]> = {
  star: [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
  inbox: [['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }], ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }]],
  cal: [['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }], ['path', { d: 'M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01' }]],
  layers: [['path', { d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' }], ['path', { d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' }], ['path', { d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' }]],
  archive: [['rect', { width: 20, height: 5, x: 2, y: 3, rx: 1 }], ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4' }]],
  book: [['path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' }], ['path', { d: 'm9 9.5 2 2 4-4' }]],
  mic: [['path', { d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z' }], ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v3' }]],
  kb: [['rect', { width: 20, height: 16, x: 2, y: 4, rx: 2 }], ['path', { d: 'M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10' }]],
  plus: [['path', { d: 'M5 12h14M12 5v14' }]],
  sparkles: [['path', { d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z' }], ['path', { d: 'M20 3v4M22 5h-4M4 17v2M5 18H3' }]],
  moon: [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
  flame: [['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' }]],
  flag: [['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7' }]],
  repeat: [['path', { d: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3' }]],
  notes: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8' }]],
  checks: [['path', { d: 'm3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8' }]],
  arrowR: [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
  arrowUp: [['path', { d: 'm5 12 7-7 7 7M12 19V5' }]],
  square: [['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }]],
  search: [['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  ellipsis: [['circle', { cx: 12, cy: 12, r: 1 }], ['circle', { cx: 19, cy: 12, r: 1 }], ['circle', { cx: 5, cy: 12, r: 1 }]],
}

export function Icon({ n, size, color, fill }: { n: keyof typeof P; size: number; color?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ?? 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color, flex: 'none', display: 'block' }} aria-hidden>
      {P[n].map(([Tag, a], i) => <Tag key={i} {...a} />)}
    </svg>
  )
}

/** A project's progress ring, as in the app's sidebar. */
export function Ring({ v, size, color }: { v: number; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" style={{ color, flex: 'none', display: 'block' }} aria-hidden>
      <circle cx={8} cy={8} r={7} strokeWidth={1.4} />
      <circle cx={8} cy={8} r={2.75} strokeWidth={5.5} strokeDasharray={`${(v * 17.28).toFixed(2)} 17.28`} transform="rotate(-90 8 8)" style={{ transition: 'stroke-dasharray .5s' }} />
    </svg>
  )
}

/** The Acture mark on its tile. */
export function Mark({ size }: { size: number }) {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '28%', background: '#141413', flex: 'none' }} aria-hidden>
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 32 32" fill="none" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14.5v3" stroke="#F5A524" />
        <path d="M9.5 11.5v9" stroke="#F5A524" />
        <path d="M14 16.5l4 4L27.5 10" stroke="#fff" />
      </svg>
    </span>
  )
}

const WAVE = [10, 22, 16, 28, 12, 24, 18, 26, 14, 20, 11, 23, 15, 27, 13, 21, 17, 25, 12, 22]
/** The listening bars, rising and falling out of step. */
export function Wave({ n, color, height }: { n: number; color: string; height: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height }} aria-hidden>
      {WAVE.slice(0, n).map((v, i) => (
        <span key={i} style={{ width: 3, height: Math.round((v / 28) * height), borderRadius: 2, background: color, transformOrigin: 'center', animation: `acture-voice .9s ease-in-out ${((i % 5) * 0.12).toFixed(2)}s infinite` }} />
      ))}
    </span>
  )
}

// ── Palettes and themes ───────────────────────────────────────────────
/** name, swatch, [ground, ink, primary, on-primary, muted] — src/lib/themes.ts, light. */
export const PAL: [string, string, [string, string, string, string, string]][] = [
  ['Default', '#bd8b2c', ['#fefffe', '#1b1c1f', '#1c1d20', '#fbfaf7', '#6b6a66']],
  ['Toffee', '#9e6240', ['#faf3ec', '#2c1d14', '#9e6240', '#ffffff', '#6b5545']],
  ['Grove', '#f9a620', ['#e9fde6', '#14261a', '#f9a620', '#14261a', '#3d5a44']],
  ['Coral', '#ff8552', ['#fff4ef', '#2e1613', '#ff8552', '#ffffff', '#6d4a43']],
  ['Ember', '#faa916', ['#fef8ea', '#2b1f0d', '#faa916', '#2b1f0d', '#6a563a']],
  ['Tide', '#1d5f8a', ['#eef4f8', '#12222e', '#1d5f8a', '#ffffff', '#48606f']],
  ['Orchid', '#6b3fa0', ['#f5f1f8', '#241a2c', '#6b3fa0', '#ffffff', '#5c4b69']],
  ['Moss', '#2f6b45', ['#f0f4ec', '#1b2418', '#2f6b45', '#ffffff', '#4d5c47']],
  ['Slate', '#27272a', ['#f4f4f5', '#1c1c1f', '#27272a', '#fafafa', '#56565c']],
]
const DARK = { fg: '#f4f3f0', mute: '#a6a39e', prim: '#e0a33e', primFg: '#2f3035', chipBg: 'rgba(255,255,255,.09)', cbIdle: 'rgba(220,218,214,.45)', tagBd: 'rgba(255,255,255,.14)', hl: 'rgba(224,163,62,.18)' }

export interface Theme {
  fg: string; mute: string; prim: string; primFg: string; chipBg: string; cbIdle: string; tagBd: string; hl: string
  bg: string; side: string; line: string; ev: string; evC: string; eve: string
}

// ── The FAQ and the chapters ──────────────────────────────────────────
export const FAQ = [
  { q: 'Is this Things?', a: 'No. Things is wonderful and you should probably buy it. Acture is for when you want that same calm list, but you would rather talk than tap through menus.' },
  { q: 'Do I have to talk to it?', a: 'Never. Press N and type, the old fashioned way, or use the shorthand. The assistant is there for when your hands are full or your thoughts are a mess.' },
  { q: 'What if it gets something wrong?', a: 'Everything it adds shows up straight away, so you can see it, and one press undoes it.' },
  { q: 'Does it talk back?', a: 'No. You can speak to it, but it always answers in writing, right where you are.' },
  { q: 'Where does my stuff go?', a: 'Your lists live in Acture’s own database. What you say or attach is sent to an AI model to be read, and that is all it is used for.' },
  { q: 'Will it buzz my phone?', a: 'Not yet. Reminders fire while Acture is open; there are no push notifications.' },
  { q: 'Is there an app?', a: 'Yes, and it is the same Acture. On a Mac, download it below. On an iPhone or Android phone, add it from your browser: its own icon and window, straight to your lists. No store, and it keeps itself up to date.' },
  { q: 'Who can use it?', a: 'Right now it is a private instance: you sign in with a Google account that has been let in. It is free while it is being built.' },
]

/** The Mac app, from the latest GitHub release — the links never change between versions. */
export const MAC_DOWNLOAD = {
  silicon: 'https://github.com/ToubbaliIlyass/LifeP/releases/latest/download/Acture-arm64.dmg',
  intel: 'https://github.com/ToubbaliIlyass/LifeP/releases/latest/download/Acture-x64.dmg',
}

export const CHAPTERS = [
  null,
  { k: '01 · Capture', l: 'Say it', h: 'Say it.', p: 'Tap Quick Capture and talk, the way you’d tell a friend. It turns it into to-dos.' },
  { k: '02 · Capture', l: 'Show it', h: 'Or show it.', p: 'A photo of the whiteboard, a timetable, a screenshot of a message. It pulls out what needs doing.' },
  { k: '03 · Plan', l: 'It finds the time', h: 'It finds the time.', p: 'Plan my day gives everything left a time, around your classes, shifts and prayers. A time you set yourself never moves.' },
  { k: '04 · Learn', l: 'It learns', h: 'It learns your real day.', p: 'Planned the gym for 7:00, went at seven in the evening, every time? It noticed. Tomorrow’s plan follows you.' },
  { k: '05 · Evening', l: 'The check-in', h: 'Once a day, it asks how it went.', p: 'Two minutes of talking teaches it more than a week of clicks.' },
  { k: '06 · The list', l: 'The list', h: 'Still a really good list.', p: 'Projects with headings, habits with streaks, deadlines apart from the day. Keyboard-first, or just start typing.' },
  { k: '07 · Yours', l: 'Make it yours', h: 'Nine palettes. Light or dark.', p: 'And the five prayers on Today, if you want them, worked out on your device from where you are.' },
  { k: '08 · Everywhere', l: 'Every device', h: 'On your Mac, iPhone and Android.', p: 'Download the Mac app, or add Acture from your browser on any device. Its own icon, its own window.', devices: true },
] as const

// ── Motion ────────────────────────────────────────────────────────────
export const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3)

/** How many screens the story takes, per phase. */
export const NCH = 10
export const STORY_VH = NCH * 110

export interface Row {
  key: string; t: string; show: boolean; hl: boolean; done: boolean; chip: string; planned: boolean
  tag?: string; due?: string; dueC?: string; pre?: ReactNode; post?: ReactNode
}

interface Pose { cx: number; cy: number; w: number; h: number; r: number; bez: number; side: number; chrome: number; icon: number; rx: number; ry: number; rz: number; sc: number }

/** Everything about one frame of the story. */
export function frame(W: number, VH: number, sp: number, introT: number) {
  // ── Story clock: ten phases, each with its own 0→1.
  const f = Math.min(NCH - 1e-4, sp * NCH), c = Math.floor(f), lp = f - c
  const seg = (a: number, b: number) => clamp((lp - a) / (b - a))
  const reached = (ch: number, at: number) => c > ch || (c === ch && lp >= at)
  const narrow = W < 900

  // ── Where the device sits in each phase: a desktop window, a phone, the app icon.
  // On a phone the device sits under the bar (never behind it) and the
  // chapter's words directly under the device, so the two never meet.
  const NARROW_TOP = 84
  const dw = narrow ? Math.min(420, W - 32) : Math.min(900, W * 0.56)
  const dh = narrow ? Math.max(240, Math.min(420, VH * 0.46)) : Math.min(580, VH * 0.72)
  const Lx = W * 0.36, Rx = W * 0.64, mid = VH * 0.5
  type Base = Omit<Pose, 'rx' | 'ry' | 'rz' | 'sc'>
  const desk = (cx: number, cy: number, extra?: Partial<Base>): Base => ({ cx, cy, w: dw, h: dh, r: 14, bez: 0, side: narrow ? 0 : dw > 760 ? 200 : 0, chrome: 1, icon: 0, ...extra })
  const phone = (cx: number, cy: number): Base => narrow
    ? { cx, cy: NARROW_TOP + dh / 2, w: Math.min(250, W - 80), h: dh, r: 40, bez: 9, side: 0, chrome: 0, icon: 0 }
    : { cx, cy, w: Math.min(300, W - 60), h: Math.min(620, VH * 0.84), r: 46, bez: 10, side: 0, chrome: 0, icon: 0 }
  const icon = (cy: number): Base => ({ cx: W / 2, cy, w: 112, h: 112, r: 30, bez: 0, side: 0, chrome: 0, icon: 1 })
  const NY = NARROW_TOP + dh / 2
  const heroTopPx = narrow ? 108 : VH < 760 ? 96 : 128
  const heroBottom = heroTopPx + (narrow ? 310 : 290)
  const y0 = Math.max(VH * 0.6, heroBottom + 24)
  const bases: Base[] = narrow
    ? [desk(W / 2, Math.max(VH * 0.64, heroBottom + 24) + dh / 2), desk(W / 2, NY), desk(W / 2, NY), desk(W / 2, NY), desk(W / 2, NY), desk(W / 2, NY), desk(W / 2, NY), desk(W / 2, NY), phone(W / 2, VH * 0.34), icon(VH * 0.26)]
    : [desk(W / 2, y0 + dh / 2, { w: Math.min(1040, W - 96), side: 200 }), desk(Rx, mid), desk(Rx, mid), desk(Rx, mid), desk(Lx, mid), desk(Rx, mid), desk(Lx, VH * 0.46), desk(Rx, VH * 0.47), phone(Rx, mid), icon(VH * 0.3)]
  const ANG = [[14, 0, 0, 0.97], [0, -6, 0, 1], [4, 3, -1, 1], [0, 0, 0, 1.02], [2, 7, 0, 1], [12, 0, 0, 0.97], [0, 0, 0, 1], [0, 0, 0, 1], [0, -8, -2, 1], [0, 0, 0, 1]]
  const am = narrow ? 0.45 : 1
  const POSES: Pose[] = bases.map((p, i) => ({ ...p, rx: ANG[i][0] * am, ry: i === 9 ? ANG[i][1] : ANG[i][1] * am, rz: ANG[i][2] * am, sc: ANG[i][3] }))
  const A = POSES[c], B = POSES[Math.min(NCH - 1, c + 1)], k = c < NCH - 1 ? ease(seg(0.7, 1)) : 0
  const Pz = Object.fromEntries((Object.keys(A) as (keyof Pose)[]).map((key) => [key, lerp(A[key], B[key], k)])) as unknown as Pose

  // ── Theme: dark for the evening, the nine palettes for "make it yours".
  const dark = c === 5
  const palIdx = c === 7 ? Math.min(8, Math.floor(seg(0.06, 0.9) * 9)) : 0
  let th: Theme
  if (dark) th = { ...DARK, bg: '#141415', side: '#101110', line: 'rgba(255,255,255,.12)', ev: 'rgba(255,255,255,.06)', evC: '#7dd3fc', eve: '#818cf8' }
  else {
    const L = PAL[palIdx][2]
    th = { fg: L[1], mute: L[4], prim: L[2], primFg: L[3], chipBg: 'rgba(0,0,0,.07)', cbIdle: 'rgba(60,60,66,.42)', tagBd: 'rgba(0,0,0,.14)', hl: 'rgba(245,165,36,.18)', bg: L[0], side: palIdx === 0 ? '#f4f5f7' : `color-mix(in oklab, ${L[0]} 95%, black)`, line: 'rgba(0,0,0,.1)', ev: 'rgba(0,0,0,.05)', evC: '#0369a1', eve: '#6366f1' }
  }

  // ── The device itself.
  const phoneness = Pz.bez / 10
  const drift = c >= 1 && c <= 8 ? (lp - 0.35) * 2 : 0
  const it = introT - 2.15
  const devIn = eo((it - 1.5) / 1.3)
  let tf = `perspective(1800px) rotateX(${Pz.rx.toFixed(2)}deg) rotateY(${(Pz.ry + drift * am).toFixed(2)}deg) rotateZ(${Pz.rz.toFixed(2)}deg) scale(${Pz.sc.toFixed(3)})`
  if (c === 0 && devIn < 1) tf = `translateY(${((1 - devIn) * VH * 0.32).toFixed(1)}px) perspective(1800px) rotateX(${(Pz.rx + (1 - devIn) * 22).toFixed(2)}deg) rotateY(${Pz.ry.toFixed(2)}deg) scale(${(Pz.sc * (0.9 + 0.1 * devIn)).toFixed(3)})`
  const dv = {
    tf, x: Pz.cx - Pz.w / 2, y: Pz.cy - Pz.h / 2, w: Pz.w, h: Pz.h, r: Pz.r, bez: Pz.bez, ir: Math.max(4, Pz.r - Pz.bez),
    iop: c === 0 ? clamp((it - 1.5) / 0.5) : 1,
    frame: phoneness > 0.05 ? '#1c1d20' : th.bg,
    outline: phoneness > 0.05 || Pz.icon > 0.05 ? 'none' : '1px solid ' + (dark ? 'rgba(255,255,255,.1)' : '#dcdad5'),
    shadow: dark ? '0 40px 100px -30px rgba(0,0,0,.7)' : '0 1px 2px rgba(0,0,0,.04), 0 40px 100px -30px rgba(40,30,10,.32)',
    chromeH: 38 * Pz.chrome, chromeOp: Pz.chrome, sideW: Pz.side, sideOp: clamp(Pz.side / 160), notchOp: phoneness * (1 - Pz.icon),
    contentOp: 1 - Pz.icon, iconOp: Pz.icon, plusOp: phoneness * (1 - Pz.icon),
    pad: Pz.w < 560 ? (phoneness > 0.5 ? '44px 18px 120px' : '20px 18px 120px') : '28px 36px 140px',
  }

  // ── Today: what appears as the story is told.
  const words = SAID.split(' '), n = words.length
  const R1 = reached(1, 0.64), R2 = reached(2, 0.6)
  const pML = reached(3, 0.2), pInk = reached(3, 0.3), pLab = reached(3, 0.4), pFl = reached(3, 0.5)
  const gymShow = reached(4, 0.04), gymLearned = reached(4, 0.74), walk = reached(5, 0.7)
  const notesPost = (col: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: col, fontSize: 11.5, opacity: 0.8 }}>
      <Icon n="notes" size={13} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon n="checks" size={13} />1/3</span>
    </span>
  )
  const flame = (col: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, color: col }}><Icon n="flame" size={13} color={col} />12</span>
  )
  const rows: Row[] = [
    { key: 'hana', t: 'Reply to Hana', show: true, hl: false, done: true, chip: '', planned: false },
    { key: 'ml', t: 'Review ML notes', show: true, tag: 'school', post: notesPost(th.mute), chip: walk ? 'Tomorrow' : pML ? '09:30' : '', planned: true, hl: c === 5 && walk, done: false },
    { key: 'ink', t: 'Pick up printer ink', show: R1, hl: c === 1 && R1, chip: pInk ? '12:15' : '', planned: true, done: false },
    { key: 'bank', t: 'Call the bank', show: R1, hl: c === 1 && R1, chip: '13:00', planned: false, done: false },
    { key: 'dhuhr', t: 'Dhuhr', show: true, hl: false, chip: '13:20', planned: false, done: false },
    { key: 'lab', t: 'Lab report', show: R1, hl: c === 1 && R1, chip: pLab ? '16:00' : '', planned: true, due: 'Thu', done: false },
    { key: 'asr', t: 'Asr', show: true, hl: false, chip: '16:40', planned: false, done: false },
    { key: 'flights', t: 'Book flights', show: R2, hl: c === 2 && R2, chip: pFl ? '17:00' : '', planned: true, done: false },
    { key: 'gym', t: 'Gym', show: gymShow, chip: gymLearned ? '19:15' : '07:00', planned: true, hl: c === 4 && gymLearned, post: flame(dark ? '#fbbf24' : '#d97706'), done: false },
    { key: 'walk', t: 'Walk', show: walk, done: true, hl: c === 5 && walk, chip: '', planned: false },
  ]
  // In the intro, the rows arrive one after another.
  const rowIn = rows.map((_, i) => !(c === 0 && it < 3.4 && it < 2.15 + i * 0.09))
  const eRows: Row[] = [
    { key: 'plants', t: 'Water the plants', show: true, hl: false, done: false, chip: '', planned: false },
    { key: 'mom', t: 'Call mom', show: R1, hl: c === 1 && R1, done: false, chip: '', planned: false },
  ]
  const todayCount = rows.filter((r, i) => r.show && rowIn[i] && !r.done).length + eRows.filter((r) => r.show).length

  // ── The island: listening, a photo to read, the conversation.
  const L1 = c === 1 && lp >= 0.1 && lp < 0.62, T1 = c === 1 && lp >= 0.62 && lp < 0.9
  const C2 = c === 2 && lp >= 0.42 && lp < 0.55, T2 = c === 2 && lp >= 0.55 && lp < 0.9
  const L5 = c === 5 && lp >= 0.15 && lp < 0.55, T5 = c === 5 && lp >= 0.55 && lp < 0.9
  const on = L1 || T1 || C2 || T2 || L5 || T5
  const isl = {
    on, wide: T1 || T2 || T5, listen: L1 || L5, compose: C2, talk: T1 || T2 || T5, userText: T1 || T5, userImg: T2,
    said: L1
      ? seg(0.14, 0.56) === 0 ? 'Listening… say everything that needs to happen.' : words.slice(0, Math.ceil(seg(0.14, 0.56) * n)).join(' ')
      : seg(0.18, 0.5) === 0 ? 'How did today go? What got done, when, and what didn’t?' : CI_SAY.slice(0, Math.ceil(seg(0.18, 0.5) * CI_SAY.length)),
    full: T5 ? CI_SAY : SAID,
    reply: T2 ? 'Added Lab report and Book flights. Meeting with Sara is on Friday at 14:00.' : T5 ? 'Logged the walk at 19:00. Review ML notes is on tomorrow at 09:30.' : 'Added 4 to-dos. Call the bank stays at 13:00, and Call mom is on this evening.',
    replyOp: (T1 && lp >= 0.66) || (T2 && lp >= 0.6) || (T5 && lp >= 0.6) ? 1 : 0,
    bg: dark ? '#2c2d31' : th.bg, fg: dark ? '#f4f3f0' : th.fg, bd: dark ? 'rgba(255,255,255,.13)' : 'rgba(220,218,213,.7)', bubble: dark ? '#3d3e43' : 'rgba(0,0,0,.06)',
    mic: dark ? '#e0a33e' : '#1c1d20', micFg: dark ? '#2f3035' : '#fbfaf7', ping: dark ? 'rgba(224,163,62,.3)' : 'rgba(28,29,32,.3)',
    waveC: dark ? 'rgba(224,163,62,.85)' : 'rgba(28,29,32,.8)',
  }

  // ── The project (chapter 6), worked through with the keyboard.
  const pk = c === 6 ? Math.min(5, Math.floor(seg(0.1, 0.85) * 6)) : 0
  const base = [
    { t: 'Pick a title', done: true, h: '' }, { t: 'Outline the three parts', done: true, h: '' },
    { t: 'Simplify the layouts', done: true, h: 'Slides' }, { t: 'Add the results chart', h: 'Slides', done: pk >= 2, notes: true },
    { t: 'Run it with Eric', h: 'Practice', rep: true, star: pk >= 3, done: false }, { t: 'Time a full rehearsal', h: 'Practice', due: 'Fri', moon: pk >= 4, done: false },
    ...(pk >= 1 ? [{ t: 'Book the room', h: 'Practice', tag: 'admin', done: false }] : []),
  ] as { t: string; h: string; done: boolean; notes?: boolean; rep?: boolean; star?: boolean; moon?: boolean; due?: string; tag?: string }[]
  const selT = ['Add the results chart', 'Book the room', 'Add the results chart', 'Run it with Eric', 'Time a full rehearsal', 'Time a full rehearsal'][pk]
  const proj: ({ heading: string } | { row: Row; selected: boolean })[] = []
  let lastH: string | null = null
  for (const x of base) {
    if (x.h !== lastH) { lastH = x.h; if (x.h) proj.push({ heading: x.h }) }
    proj.push({
      selected: x.t === selT && c === 6,
      row: {
        key: x.t, t: x.t, show: true, hl: false, done: x.done, chip: '', planned: false, tag: x.tag, due: x.due ? 'Due ' + x.due : undefined,
        pre: x.star ? <Icon n="star" size={13} color="#fbbf24" fill="#fbbf24" /> : x.moon ? <Icon n="moon" size={13} color="#6366f1" /> : undefined,
        post: x.rep ? <Icon n="repeat" size={13} color="rgba(107,106,102,.75)" /> : x.notes ? notesPost(th.mute) : undefined,
      },
    })
  }
  const projDone = base.filter((x) => x.done).length / base.length
  const keycaps = ([['N', 'New to-do'], ['Space', 'Complete'], ['T', 'Today'], ['E', 'This evening'], ['A–Z', 'Quick Find']] as const).map(([kk, l], i) => ({ k: kk, l, active: c === 6 && pk === i + 1 }))

  // ── The learning card (chapter 4).
  const lop = c === 4 ? Math.min(seg(0.06, 0.16), 1 - seg(0.82, 0.92)) : 0
  const dotsP = c > 4 ? 1 : c === 4 ? seg(0.12, 0.58) : 0
  const curveP = c > 4 ? 1 : c === 4 ? seg(0.58, 0.74) : 0
  const lw = narrow ? Math.min(W - 32, 420) : Math.min(420, Pz.w * 0.62)
  // On a phone, inside the window's lower part, clear of the words under it.
  const learn = { x: Pz.cx - lw / 2 + (narrow ? 0 : Pz.w * 0.12), y: narrow ? Pz.cy - Pz.h / 2 + 56 : Pz.cy - 30, w: lw, op: lop, ty: (1 - seg(0.06, 0.16)) * 30, dotsP, curveP }

  // ── The whiteboard photo (chapter 2), flying into the island.
  const ph = c === 2 ? ease(seg(0.12, 0.42)) : 0
  const sx = narrow ? W / 2 - 105 : W * 0.08 + 10, sy = narrow ? VH * 0.82 : VH * 0.64, ex = Pz.cx - 105, ey = Pz.cy + Pz.h / 2 - 110
  const photo = { op: c === 2 && lp < 0.44 ? Math.min(1, seg(0.02, 0.1)) : 0, tf: `translate(${lerp(sx, ex, ph)}px, ${lerp(sy, ey, ph)}px) rotate(${lerp(-7, 0, ph)}deg) scale(${lerp(1, 0.22, ph)})` }

  // ── The chapters' words, on whichever side the device is not.
  const texts = CHAPTERS.slice(1).map((ch, j) => {
    const i = j + 1, pose = POSES[i]
    const inn = c === i ? seg(0, 0.12) : 0, out = c === i ? seg(0.74, 0.88) : 0, op = c === i ? Math.min(inn, 1 - out) : 0
    const leftSide = pose.cx > W / 2, tw = Math.max(280, Math.min(400, W * 0.27)), dk = i === 5
    return {
      ...ch!, op,
      left: narrow ? 20 : leftSide ? Math.max(24, W * 0.07) : W * 0.93 - tw,
      width: narrow ? W - 40 : tw,
      top: narrow ? NARROW_TOP + dh + 20 : pose.cy,
      tf: `translateY(${narrow ? 0 : -50}%) translateY(${(1 - inn) * 26 - out * 26}px)`,
      align: (narrow ? 'center' : 'left') as CSSProperties['textAlign'],
      fs: narrow ? 'clamp(28px,7vw,36px)' : 'clamp(34px,3.6vw,52px)',
      fg: dk ? '#f4f3f0' : '#1b1c1f', pc: dk ? '#bdbab4' : '#4a4a48', kc: dk ? '#818cf8' : '#b45309',
      // The per-device steps need room a short phone does not have.
      showDevices: 'devices' in ch! && !!ch!.devices && (!narrow || VH >= 720),
    }
  })

  const heroOp = c === 0 ? 1 - seg(0.2, 0.55) : 0
  const endOp = c === 9 ? seg(0.15, 0.4) : 0
  const chapN = Math.max(1, Math.min(8, c))

  return {
    c, lp, narrow, dark, th, dv, Pz, rows, rowIn, eRows, todayCount, isl, proj, projDone, keycaps, learn, photo, texts, palIdx,
    hero: { op: heroOp, ty: -seg(0, 0.6) * 60, top: heroTopPx },
    end: { op: endOp, top: Pz.cy + 90 },
    // On a phone the chapter's own label says where you are; the counter
    // would only sit on top of its words.
    chap: { on: !narrow && c >= 1 && c <= 8, n: String(chapN).padStart(2, '0'), l: CHAPTERS[chapN]!.l, pct: lp * 100 },
    sideToday: c === 6 ? 'transparent' : dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)',
    sideProj: c === 6 ? 'rgba(0,0,0,.08)' : 'transparent',
    showProject: c === 6, quickFind: c === 6 && pk === 5,
    sparkOn: c === 3 && lp >= 0.08 && lp < 0.24,
    planNote: reached(3, 0.58) && c < 6,
    checkInBanner: c === 5 && lp < 0.15,
    keysOn: c === 6 && !narrow, palsOn: c === 7 && !narrow,
    glow: { x: Pz.cx, y: Pz.cy, c: dark ? 'rgba(129,140,248,.16)' : 'rgba(245,165,36,.14)' },
  }
}

export type Frame = ReturnType<typeof frame>
