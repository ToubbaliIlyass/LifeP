'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { WhyScene } from './why-scene'

/*
 * The second story: why it works, and the world it can grow.
 *
 * The first story (StoryLanding) ends by flying into the app's icon until
 * the screen is its dark tile; this one starts on the same dark, where the
 * icon's tick is gathered back together out of points of light. From there
 * the same points carry the psychology — open loops, a plan with a when, the
 * planning fallacy, identity — and then become the three worlds the app can
 * draw (why-scene.ts). The words are the facts, and say where they are from.
 */

export const WHY_BG = '#141413'

const STEPS: { k?: string; h: string; p: string; src?: string; world?: boolean }[] = [
  { k: 'Why it works', h: 'Every tick is a promise kept.', p: 'That’s the app. Underneath it are a few well-tested ideas about how people actually get things done, and one new one that’s entirely optional.' },
  { k: '01 · Open loops', h: 'Unfinished things keep pulling at you.', p: 'An undone task tugs at your attention until it’s dealt with. Not finished, just planned: making a concrete plan is enough to quiet it. Saying it to Acture is that plan.', src: 'Masicampo & Baumeister, 2011' },
  { k: '02 · When and where', h: 'A plan needs a when.', p: 'Deciding exactly when and where you’ll do something makes you far more likely to follow through than only meaning to. So everything you say gets a time on your day.', src: 'Implementation intentions · Gollwitzer & Sheeran, 2006, across 94 studies' },
  { k: '03 · The real you', h: 'Plans are optimists.', p: 'We misjudge when things will get done, even knowing we usually do. So Acture stops planning for the you who meant to go at 7am, and plans for the one who goes at seven in the evening.', src: 'The planning fallacy · Buehler, Griffin & Ross, 1994' },
  { k: '04 · Identity', h: 'Every tick is a vote.', p: 'We come to know who we are partly by watching what we do. So name who you’re becoming (a runner, a writer, a good friend) and every to-do you finish counts as a vote for them.', src: 'Self-perception theory · Bem, 1972 · and James Clear, Atomic Habits' },
  { k: 'Optional · Your world', h: 'Then, if you like, watch it grow.', p: 'Seeing progress on work that matters is one of the strongest everyday lifts to motivation. So your votes can build something: a night sky, where each person you’re becoming is a constellation…', src: 'The progress principle · Amabile & Kramer, 2011', world: true },
  { k: 'Optional · Your world', h: '…a path, a step for each thing done…', p: 'Trees grow beside it in the colours of who you were being that day, and a lantern marks every 25 steps. Look back, and see how far you’ve come.', world: true },
  { k: 'Optional · Your world', h: '…or a small city.', p: 'Each person you’re becoming gets a district, and every vote adds a floor. Pick the world you like and switch whenever: it’s built from the same votes.', world: true },
  { h: 'Your to-dos won’t say themselves.', p: 'The world stays off until you switch it on, and it’s gentle when you do: no points, no leaderboards, and a missed day takes nothing away.' },
]
const NP = STEPS.length

const clamp = (x: number) => Math.max(0, Math.min(1, x))

export function WhyStory({ W, VH, onActive, buttons }: {
  W: number
  VH: number
  /** Whether this story has the screen, so the bar can go dark with it. */
  onActive: (active: boolean) => void
  /** The doors into the app, as the page draws them. */
  buttons: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<WhyScene | null>(null)
  const [f, setF] = useState(0)
  const [enter, setEnter] = useState(0)
  const [near, setNear] = useState(false)
  const active = useRef(false)

  // Where the reader is: `enter` while the section rises into view, then `f` through the pinned part.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 800
      const nf = Math.round(clamp(-r.top / Math.max(1, r.height - vh)) * 4000) / 4000
      const ne = Math.round(clamp(1 - r.top / vh) * 1000) / 1000
      setF(nf); setEnter(ne)
      sceneRef.current?.setProgress(nf, ne)
      const on = r.top < vh * 0.5 && r.bottom > vh * 0.5
      if (on !== active.current) { active.current = on; onActive(on) }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    tick()
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [onActive])

  // three.js only once the section is close.
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setNear(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: '150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    if (!near) return
    let alive = true
    import('./why-scene')
      .then(({ createWhyScene }) => {
        if (!alive || !canvasRef.current || !labelsRef.current) return
        sceneRef.current = createWhyScene(canvasRef.current, labelsRef.current)
        const r = ref.current?.getBoundingClientRect(), vh = window.innerHeight || 800
        if (r) sceneRef.current.setProgress(clamp(-r.top / Math.max(1, r.height - vh)), clamp(1 - r.top / vh))
      })
      .catch(() => {})
    return () => { alive = false; sceneRef.current?.dispose(); sceneRef.current = null }
  }, [near])

  const narrow = W < 900
  const x = Math.min(NP - 1e-4, f * NP), c = Math.floor(x), lp = x - c
  const seg = (a: number, b: number) => clamp((lp - a) / (b - a))

  return (
    <section id="why" ref={ref} aria-label="Why it works" style={{ position: 'relative', height: `${NP * 100 + 40}vh`, background: WHY_BG }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: WHY_BG, color: '#f4f3f0' }}>
        <div aria-hidden style={{ position: 'absolute', left: '50%', top: '45%', width: 1100, height: 800, transform: 'translate(-50%,-50%)', background: 'radial-gradient(closest-side, rgba(129,140,248,.10), transparent)', pointerEvents: 'none' }} />
        <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div ref={labelsRef} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        {narrow && <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%', background: `linear-gradient(to top, ${WHY_BG} 55%, transparent)`, pointerEvents: 'none' }} />}

        {STEPS.map((s, i) => {
          const first = i === 0, last = i === NP - 1
          const op = first
            ? Math.min(clamp((enter - 0.55) / 0.35), c === 0 ? 1 - seg(0.66, 0.8) : 0)
            : last ? (c === i ? seg(0.04, 0.2) : 0)
            : c === i ? Math.min(seg(0.04, 0.16), 1 - seg(0.66, 0.8)) : 0
          const centered = narrow || first || last
          const box: CSSProperties = narrow
            ? { left: 20, right: 20, bottom: last ? 'auto' : 32, top: last ? Math.max(90, VH * 0.12) : 'auto', textAlign: 'center' }
            : first ? { left: '50%', width: 600, marginLeft: -300, top: '50%', marginTop: Math.min(190, VH * 0.22), textAlign: 'center' }
            : last ? { left: '50%', width: 760, marginLeft: -380, top: Math.max(96, VH * 0.13), textAlign: 'center' }
            : { left: Math.max(24, W * 0.07), width: Math.max(300, Math.min(420, W * 0.3)), top: '50%', transform: 'translateY(-50%)' }
          return (
            <div key={i} aria-hidden={op < 0.5} style={{ position: 'absolute', ...box, opacity: op, pointerEvents: op > 0.5 && last ? 'auto' : 'none', translate: `0 ${((1 - op) * 18).toFixed(1)}px` }}>
              {s.k && <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: s.world ? '#a5b4fc' : '#F5A524' }}>{s.k}</div>}
              {last
                ? <h2 style={{ margin: 0, fontSize: 'clamp(36px,5.6vw,68px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, textWrap: 'balance', background: 'linear-gradient(90deg,#fff,#a6a39e)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', paddingBottom: 4 }}>{s.h}</h2>
                : <h2 style={{ margin: '12px 0 0', fontSize: narrow ? 'clamp(26px,7vw,34px)' : first ? 'clamp(36px,4.4vw,60px)' : 'clamp(32px,3.4vw,48px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.02, textWrap: 'balance' }}>{s.h}</h2>}
              <p style={{ margin: `14px ${centered ? 'auto' : 0} 0`, maxWidth: last ? 560 : 520, fontSize: narrow ? 15 : 16.5, lineHeight: 1.55, color: '#bdbab4', textWrap: 'pretty' }}>{s.p}</p>
              {s.src && <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.4, color: '#7f7c76' }}>{s.src}</p>}
              {last && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 }}>{buttons}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
