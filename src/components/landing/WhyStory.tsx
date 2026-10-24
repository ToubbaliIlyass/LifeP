'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { WhyScene } from './why-scene'

/*
 * The second story: the psychology of becoming someone, and the world it can grow.
 *
 * The first story (StoryLanding) ends by flying into the app's icon until
 * the screen is its dark tile; this one starts on the same dark, where the
 * icon's tick is gathered back together out of points of light. From there
 * the same points carry the psychology of changing who you are — evidence,
 * identity, small wins, nothing resetting — and then become the three
 * worlds the app can draw (why-scene.ts). The first story already told how
 * the app plans; this one is only about becoming. The words are the
 * findings, and say where they are from.
 */

export const WHY_BG = '#141413'

const STEPS: { k?: string; h: string; p: string; src?: string; world?: boolean }[] = [
  { k: 'Why it works', h: 'You don’t become someone all at once.', p: 'That’s the app. Underneath it is an idea about identity: who you are changes the way a habit does, one small piece of proof at a time.' },
  { k: '01 · Evidence', h: 'You learn who you are by watching what you do.', p: 'We don’t only act on who we think we are; we work out who we are from how we act. Every finished thing, however small, is a piece of evidence.', src: 'Self-perception theory · Bem, 1972' },
  { k: '02 · Identity', h: 'Be a runner, not someone trying to run.', p: 'Asking people to be something, rather than to do something, changes what they do: in one study, “be a voter” got more people to the polls than “vote”. So name who you’re becoming, and every to-do you finish counts as a vote for them.', src: 'Bryan, Walton, Rogers & Dweck, 2011 · and James Clear, Atomic Habits' },
  { k: '03 · Small wins', h: 'Proof beats promises.', p: 'A resolution is easy to doubt. A week of small things done is hard to argue with. Making progress on something that matters is one of the strongest everyday lifts there is.', src: 'The progress principle · Amabile & Kramer, 2011' },
  { k: '04 · Nothing resets', h: 'A missed day takes nothing away.', p: 'Break a perfect streak and it’s tempting to drop the whole thing. So nothing here goes back to zero. Votes never expire; the proof only piles up.', src: 'The “what-the-hell” effect · Polivy & Herman' },
  { k: 'Optional · Your world', h: 'Then, if you like, watch it grow.', p: 'Your votes can build something you can see. A night sky, where each person you’re becoming is a constellation…', world: true },
  { k: 'Optional · Your world', h: '…a path, a step for each thing done…', p: 'Trees grow beside it in the colours of who you were being that day, and a lantern marks every 25 steps. Look back, and see how far you’ve come.', world: true },
  { k: 'Optional · Your world', h: '…or a small city.', p: 'Each person you’re becoming gets a district, and every vote adds a floor. Pick the world you like and switch whenever: it’s built from the same votes.', world: true },
  { h: 'Your to-dos won’t say themselves.', p: 'The world stays off until you switch it on, and it’s gentle when you do: no points, no leaderboards, and nothing ever lost.' },
]
const NP = STEPS.length
/** How many screens ahead of this section the picture starts to gather. */
const LEAD = 1.35

const clamp = (x: number) => Math.max(0, Math.min(1, x))

export function WhyStory({ W, VH, k, onActive, buttons }: {
  /** The page's own coordinates (see stageScale in StoryLanding). */
  W: number
  VH: number
  /** How much the page is scaled up, on a large screen. */
  k: number
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
  /** The picture layer: whether it is drawn at all, and how much of it, as the section arrives and leaves. */
  const [layer, setLayer] = useState({ on: false, op: 0 })
  const [near, setNear] = useState(false)
  const active = useRef(false)
  const textRefs = useRef<(HTMLDivElement | null)[]>([])
  /** The room the words take, as last measured — handed to the scene when it arrives. */
  const insets = useRef({ top: 0, bottom: 0 })

  // Where the reader is: `enter` while the section rises into view, then `f` through the pinned part.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 800
      const nf = Math.round(clamp(-r.top / Math.max(1, r.height - vh)) * 4000) / 4000
      // The dust starts gathering a little before this section's edge arrives,
      // while the screen is still the first story's dark tile, so there is no
      // line where one story stops and the other starts.
      const ne = Math.round(clamp((LEAD * vh - r.top) / (LEAD * vh)) * 1000) / 1000
      const lon = r.top < LEAD * vh && r.bottom > 0
      setF(nf); setEnter(ne)
      // The canvas paints its own dark, so it fades in over the first story's dark tile and out under the questions.
      setLayer({ on: lon, op: Math.round(Math.min(clamp(ne * 2.5), clamp(r.bottom / vh)) * 1000) / 1000 })
      sceneRef.current?.setProgress(nf, ne)
      sceneRef.current?.setActive(lon)
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
        sceneRef.current.setInsets(insets.current.top, insets.current.bottom)
        const r = ref.current?.getBoundingClientRect(), vh = window.innerHeight || 800
        if (r) {
          sceneRef.current.setProgress(clamp(-r.top / Math.max(1, r.height - vh)), clamp((LEAD * vh - r.top) / (LEAD * vh)))
          sceneRef.current.setActive(r.top < LEAD * vh && r.bottom > 0)
        }
      })
      .catch(() => {})
    return () => { alive = false; sceneRef.current?.dispose(); sceneRef.current = null }
  }, [near])

  // As the first story decides: one column only when the screen is narrow and not lying on its side.
  const narrow = W < 900 && W < VH * 1.2, short = !narrow && VH < 560
  /** A small phone: a little less type, so the picture keeps some room. */
  const tiny = narrow && VH < 640
  const x = Math.min(NP - 1e-4, f * NP), c = Math.floor(x), lp = x - c
  const seg = (a: number, b: number) => clamp((lp - a) / (b - a))

  // On a narrow screen the words share the screen with the picture: tell the
  // scene how much they take — under it, or over it at the end — so a long
  // paragraph on a small phone never sits on top of what it describes.
  useLayoutEffect(() => {
    const el = textRefs.current[c]
    const next = !narrow || !el ? { top: 0, bottom: 0 }
      : c === NP - 1 ? { top: el.offsetTop + el.offsetHeight + 16, bottom: 0 }
      : { top: 76, bottom: VH - el.offsetTop + 16 }
    insets.current = next
    sceneRef.current?.setInsets(next.top, next.bottom)
  }, [c, narrow, W, VH])

  return (
    <section id="why" ref={ref} aria-label="Why it works" style={{ position: 'relative', height: `${NP * 100 + 40}vh`, background: WHY_BG }}>
      {/* The picture, pinned to the screen rather than clipped to this
          section: it fades in over the first story's dark ending and out
          under the questions that follow, never cut off at an edge. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', visibility: layer.on ? 'visible' : 'hidden', opacity: layer.op }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div ref={labelsRef} style={{ position: 'absolute', inset: 0, '--why-k': k } as CSSProperties} />
      </div>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, height: '100vh', overflow: 'hidden', color: '#f4f3f0' }}>
        {/* The path and the town fill the screen, bright sky and all: a soft
            shade where the words sit keeps them readable — beside them on a
            wide screen, over them at the end. */}
        {!narrow && <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(12,12,18,.78) 0%, rgba(12,12,18,.5) 30%, rgba(12,12,18,0) 52%)', opacity: c === 6 || c === 7 ? 1 : c === 5 ? seg(0.62, 1) : c === NP - 1 ? 1 - seg(0, 0.2) : 0 }} />}
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: narrow ? '62%' : '58%', pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(12,12,18,.82) 0%, rgba(12,12,18,.55) 55%, rgba(12,12,18,0) 100%)', opacity: c === NP - 1 ? seg(0, 0.2) : 0 }} />
        {/* On a phone the words sit over the lower half: shade it, except at the end, where they move to the top. */}
        {narrow && <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%', background: `linear-gradient(to top, ${WHY_BG} 55%, transparent)`, pointerEvents: 'none', opacity: c === NP - 1 ? 1 - seg(0, 0.2) : c === NP - 2 ? 1 - seg(0.62, 1) : 1 }} />}

        {/* The words, in the page's coordinates, scaled up with it on a large screen. */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: VH, transform: k === 1 ? undefined : `scale(${k})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
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
            : { left: Math.max(24, W * 0.07), width: Math.min(420, Math.max(200, W * (short ? 0.42 : 0.36) - Math.max(24, W * 0.07) - 16)), top: short ? 'calc(50% + 30px)' : '50%', transform: 'translateY(-50%)' }
          return (
            <div key={i} ref={(el) => { textRefs.current[i] = el }} aria-hidden={op < 0.5} style={{ position: 'absolute', ...box, opacity: op, pointerEvents: op > 0.5 && last ? 'auto' : 'none', translate: `0 ${((1 - op) * 18).toFixed(1)}px` }}>
              {s.k && <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: s.world ? '#a5b4fc' : '#F5A524' }}>{s.k}</div>}
              {last
                ? <h2 style={{ margin: 0, fontSize: 'clamp(36px,5.6vw,68px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, textWrap: 'balance', background: 'linear-gradient(90deg,#fff,#a6a39e)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', paddingBottom: 4 }}>{s.h}</h2>
                : <h2 style={{ margin: '12px 0 0', fontSize: tiny ? 'clamp(23px,6.6vw,28px)' : narrow ? 'clamp(26px,7vw,34px)' : short ? 'clamp(22px,3vw,30px)' : first ? 'clamp(36px,4.4vw,60px)' : 'clamp(32px,3.4vw,48px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.02, textWrap: 'balance' }}>{s.h}</h2>}
              <p style={{ margin: `${short ? 8 : 14}px ${centered ? 'auto' : 0} 0`, maxWidth: last ? 560 : 520, fontSize: short || tiny ? 13.5 : narrow ? 14.5 : 16.5, lineHeight: short || tiny ? 1.45 : 1.55, color: '#bdbab4', textWrap: 'pretty' }}>{s.p}</p>
              {s.src && <p style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.4, color: '#7f7c76' }}>{s.src}</p>}
              {last && <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 }}>{buttons}</div>}
            </div>
          )
        })}
        </div>
      </div>
    </section>
  )
}
