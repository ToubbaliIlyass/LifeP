'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { install, useInstall } from '@/components/install/InstallApp'
import {
  FAQ, Icon, Mark, PAL, Ring, STORY_VH, Wave, clamp, eo, frame, lerp,
  type Frame, type Row, type Theme,
} from './story-engine'

/*
 * The landing page: one scroll, and a day happens.
 *
 * Built from the Claude Design file "Acture Landing v4". The intro draws the
 * mark — a voice becoming a tick — and flies it into the bar; then the story
 * is pinned to the screen while the page scrolls under it, through eight
 * chapters, each one something Acture really does. What moves and when is
 * decided in story-engine.tsx; this file draws it, and wires the doors to the
 * real app: Open Acture, and Start today — Google sign-in, through Supabase.
 */

const INTRO_END = 5.8

/** One to-do row, as the app draws it. */
function TodoRow({ r, th, visible = true, bg }: { r: Row; th: Theme; visible?: boolean; bg?: string }) {
  const shown = r.show && visible
  return (
    <div style={{ overflow: 'hidden', maxHeight: shown ? 64 : 0, opacity: shown ? 1 : 0, transition: 'max-height .5s cubic-bezier(.32,.72,0,1), opacity .4s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 8px', margin: '0 -8px', borderRadius: 6, lineHeight: '22px', background: bg ?? (r.hl ? th.hl : 'transparent'), transition: 'background .6s' }}>
        <div style={{ flex: 'none', width: 15, height: 15, marginTop: 3.5, boxSizing: 'border-box', borderRadius: 4, border: `1.5px solid ${r.done ? '#F5A524' : th.cbIdle}`, background: r.done ? '#F5A524' : 'transparent', display: 'grid', placeItems: 'center', transition: 'all .3s' }}>
          <div style={{ width: 3.5, height: 7, border: 'solid #1b1c1f', borderWidth: '0 2px 2px 0', transform: 'translateY(-1px) rotate(45deg)', opacity: r.done ? 1 : 0 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
          {!!r.chip && !r.done && (
            <span style={{ flex: 'none', borderRadius: 4, background: th.chipBg, padding: '0 6px', fontSize: 11.5, fontWeight: 500, lineHeight: '18px', color: r.planned ? th.mute : th.fg, opacity: r.planned ? 0.6 : 1, fontVariantNumeric: 'tabular-nums' }}>{r.chip}</span>
          )}
          {r.pre}
          <span style={{ minWidth: 0, color: r.done ? th.mute : th.fg, textDecoration: r.done ? 'line-through' : 'none' }}>{r.t}</span>
          {r.post}
          {r.tag && <span style={{ flex: 'none', borderRadius: 999, border: `1px solid ${th.tagBd}`, padding: '0 6px', fontSize: 11, lineHeight: '16px', color: th.mute }}>{r.tag}</span>}
        </div>
        {r.due && !r.done && (
          <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: r.dueC ?? '#f59e0b' }}><Icon n="flag" size={12} color={r.dueC ?? '#f59e0b'} />{r.due}</span>
        )}
      </div>
    </div>
  )
}

/** The learning chart: two weeks of gym, planned at 7:00, done around 19:15. */
function LearnChart({ dotsP, curveP }: { dotsP: number; curveP: number }) {
  const DAYS = 'MTWTFSSMTWTFSS'.split('')
  const DONE_MIN = [1150, 1165, 1130, 1160, 1145, 1175, 1155, 1140, 1170, 1150, 1160, 1135, 1165, 1150]
  const CW = 600, CH = 270, x0 = 52, x1 = 580
  const xs = (i: number) => x0 + 10 + i * ((x1 - x0 - 20) / 13)
  const ys = (m: number) => 14 + ((m - 360) / (1320 - 360)) * (CH - 46)
  const font = { fontFamily: 'var(--font-inter), Inter, sans-serif' }
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      {([[420, '7am'], [720, 'noon'], [1140, '7pm']] as const).map(([m, l]) => (
        <g key={l}><line x1={x0} x2={CW} y1={ys(m)} y2={ys(m)} stroke="#ebe9e5" strokeWidth={1} /><text x={0} y={ys(m) + 4} fill="#6b6a66" fontSize={13} style={font}>{l}</text></g>
      ))}
      <line x1={x0 + 4} x2={x1} y1={ys(420)} y2={ys(420)} stroke="#9a9893" strokeWidth={2} strokeDasharray="4 6" opacity={curveP > 0.9 ? 0.35 : 1} />
      <text x={x0 + 4} y={ys(420) - 10} fill="#6b6a66" fontSize={13} fontWeight={500} style={font}>planned</text>
      {DONE_MIN.map((m, i) => {
        const v = dotsP * 14 > i
        return (
          <g key={i}>
            <circle cx={xs(i)} cy={ys(m)} r={8} fill="#F5A524" style={{ opacity: v ? 1 : 0, transform: v ? 'scale(1)' : 'scale(.3)', transformBox: 'fill-box', transformOrigin: 'center', transition: 'opacity .3s, transform .4s cubic-bezier(.32,.72,0,1)' }} />
            <text x={xs(i)} y={CH - 2} textAnchor="middle" fill="#6b6a66" fontSize={12} style={font}>{DAYS[i]}</text>
          </g>
        )
      })}
      <path d={`M ${x0 + 4} ${ys(420)} C ${(x0 + x1) / 2} ${ys(420)}, ${(x0 + x1) / 2} ${ys(1155)}, ${x1} ${ys(1155)}`} fill="none" stroke="#1b1c1f" strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - curveP} />
      <text x={x1} y={ys(1155) - 14} textAnchor="end" fill="#1b1c1f" fontSize={15} fontWeight={700} style={{ ...font, opacity: curveP >= 1 ? 1 : 0 }}>19:15</text>
    </svg>
  )
}

/** The opening: the mark drawn from a voice, then flown into the bar. */
function Splash({ lt, W, VH, target }: { lt: number; W: number; VH: number; target: { x: number; y: number } | null }) {
  const it = lt - 2.15
  const tx = target ? target.x : W / 2, ty = target ? target.y : 45
  const fly = eo((it - 0.85) / 0.55), endS = 26 / 96
  const back = (x: number) => { x = clamp(x); return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2) }
  const pop = back(lt / 0.55), morph = eo((lt - 0.05) / 0.5)
  const wp = eo((lt - 2.35) / 0.45), off = wp * 84 * (1 - fly)
  const sS = lerp(lerp(0.15, 1, pop), endS, fly), sx = lerp(W / 2 - off, tx, fly), sy = lerp(VH * 0.42, ty, fly)
  const lin = clamp((lt - 0.35) / 0.3), cp = eo((lt - 1.4) / 0.5), ck = eo((lt - 1.95) / 0.4)
  const pg = clamp((lt - 2.3) / 0.65), bump = 1 + 0.07 * Math.sin(Math.PI * clamp((lt - 2.2) / 0.32))
  const bars = [4, 8, 12, 16, 20, 24, 28].map((x, i) => {
    const wv = 2 + 12 * Math.abs(Math.sin(lt * 7.5 + i * 1.25)) * (0.55 + 0.45 * Math.pow(Math.sin(i * 2.1 + 1), 2))
    const tgt = i === 0 ? [5, 3] : i === 1 ? [9.5, 9] : [9.5, 0]
    const hh = lerp(lerp(0, wv, lin), tgt[1], cp), xx = lerp(x, tgt[0], cp)
    const op = lin <= 0 ? 0 : i < 2 ? 1 : 1 - clamp(cp * 1.6)
    return <line key={i} x1={xx} x2={xx} y1={16 - hh / 2} y2={16 + hh / 2} stroke="#F5A524" strokeWidth={3.2} strokeLinecap="round" opacity={op} />
  })
  return (
    <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, zIndex: 60, pointerEvents: 'none', transformOrigin: '0 0', transform: `translate(${(sx - 48 * sS).toFixed(1)}px, ${(sy - 48 * sS).toFixed(1)}px) scale(${sS.toFixed(4)})`, opacity: it >= 1.42 ? 0 : clamp(lt / 0.1) }}>
      <span style={{ position: 'relative', display: 'block', width: 96, height: 96 }}>
        <span style={{ position: 'absolute', inset: -90, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(245,165,36,.35), transparent)', opacity: (0.55 * lin * (1 - fly) * (0.75 + 0.25 * Math.sin(lt * 6))).toFixed(3) }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '28%', border: '2px solid #F5A524', transform: `scale(${lerp(1, 1.75, eo(pg)).toFixed(3)})`, opacity: pg > 0 && pg < 1 ? (0.6 * (1 - pg)).toFixed(3) : 0 }} />
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: lerp(50, 28, morph).toFixed(1) + '%', background: '#141413', transform: `scale(${bump.toFixed(3)})`, boxShadow: `0 ${(20 * (1 - fly)).toFixed(0)}px ${(50 * (1 - fly)).toFixed(0)}px rgba(0,0,0,${(0.25 * (1 - fly)).toFixed(2)})` }}>
          <svg width={64} height={64} viewBox="0 0 32 32" fill="none" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
            {bars}
            <path d="M14 16.5l4 4L27.5 10" stroke="#fff" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ck} opacity={ck > 0 ? 1 : 0} />
          </svg>
        </span>
        <span style={{ position: 'absolute', left: 116, top: '50%', transform: 'translateY(-50%)', display: 'flex', fontSize: 48, fontWeight: 700, letterSpacing: '-0.035em', color: '#1b1c1f', whiteSpace: 'nowrap' }}>
          {'Acture'.split('').map((ch, i) => {
            const p = eo((lt - 2.45 - i * 0.055) / 0.42)
            return <span key={i} style={{ display: 'inline-block', opacity: (p * (1 - clamp(fly * 2.5))).toFixed(3), transform: `translateY(${((1 - p) * 0.35).toFixed(3)}em)`, filter: p >= 1 ? 'none' : `blur(${((1 - p) * 8).toFixed(1)}px)` }}>{ch}</span>
          })}
        </span>
      </span>
    </div>
  )
}

const BTN_DARK: CSSProperties = { display: 'inline-flex', alignItems: 'center', flex: 'none', whiteSpace: 'nowrap', height: 44, boxSizing: 'border-box', borderRadius: 10, background: '#1b1c1f', color: '#fefffe', padding: '0 18px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }
const BTN_LIGHT: CSSProperties = { display: 'inline-flex', alignItems: 'center', flex: 'none', whiteSpace: 'nowrap', height: 44, boxSizing: 'border-box', borderRadius: 10, border: '1px solid #dcdad5', background: '#fff', color: '#1b1c1f', padding: '0 18px', fontSize: 16, fontWeight: 500, textDecoration: 'none' }

export function StoryLanding() {
  const [size, setSize] = useState({ w: 1280, vh: 800 })
  const [sp, setSp] = useState(0)
  /** Seconds into the intro; past INTRO_END it is over (or was skipped). */
  const [lt, setLt] = useState(0)
  const [navTarget, setNavTarget] = useState<{ x: number; y: number } | null>(null)
  const [faqOpen, setFaqOpen] = useState(0)
  const [faqSeen, setFaqSeen] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const storyRef = useRef<HTMLElement>(null)
  const navMarkRef = useRef<HTMLSpanElement>(null)
  const faqRef = useRef<HTMLDivElement>(null)
  const installState = useInstall()

  // Size, and where the bar's mark is (the intro flies the big mark there).
  useLayoutEffect(() => {
    const measure = () => {
      setSize({ w: window.innerWidth || 1280, vh: window.innerHeight || 800 })
      const r = navMarkRef.current?.getBoundingClientRect()
      if (r && r.width) setNavTarget({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // How far through the story the page has scrolled, 0→1.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const el = storyRef.current
      if (!el) return
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 800
      setSp(Math.round(clamp(-r.top / Math.max(1, r.height - vh)) * 4000) / 4000)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick) }
    window.addEventListener('scroll', onScroll, { passive: true })
    tick()
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  // The intro: played once, from the top. Skipped when the page opens part
  // way down, in a background tab, or for anyone who asked for less motion.
  useEffect(() => {
    const skip = (window.scrollY || 0) > 40 || document.hidden || navigator.webdriver
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (skip) { setLt(99); return }
    const t0 = performance.now()
    let raf = requestAnimationFrame(function loop() {
      const t = (performance.now() - t0) / 1000
      if (t >= INTRO_END || document.hidden) { setLt(99); return }
      setLt(t)
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // The questions rise in the first time they are seen.
  useEffect(() => {
    const el = faqRef.current
    if (!el || !('IntersectionObserver' in window)) { setFaqSeen(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setFaqSeen(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const signIn = useCallback(async () => {
    setSigningIn(true)
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setSigningIn(false); window.location.href = '/login' }
  }, [])

  const W = size.w, VH = size.vh
  const F: Frame = frame(W, VH, sp, lt)
  const { dark } = F
  const it = lt - 2.15
  const fadeUp = (t0: number) => { const p = eo((it - t0) / 0.6); return { opacity: p, transform: `translateY(${((1 - p) * 14).toFixed(1)}px)` } }
  const heroLine = 'You’ll lie to your to-do list. Acture learns anyway.'
  const heroWords = heroLine.split(' ')
  const inStory = sp > 0 && sp < 1

  const navFg = dark ? '#f4f3f0' : '#1b1c1f', navMute = dark ? '#bdbab4' : '#6b6a66', navBd = dark ? 'rgba(255,255,255,.12)' : '#dcdad5'

  return (
    <div style={{ background: '#fefffe', color: '#1b1c1f', fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', overflowX: 'clip' }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[70] focus:rounded-lg focus:bg-[#1b1c1f] focus:px-3 focus:py-2 focus:text-white">Skip to content</a>

      {/* How far through the story. */}
      <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, height: 2, width: `${(sp * 100).toFixed(2)}%`, background: '#F5A524', zIndex: 41, opacity: inStory ? 1 : 0, transition: 'opacity .3s' }} />

      {/* ── The bar ── */}
      <nav aria-label="Main" style={{ position: 'fixed', left: 0, right: 0, top: 0, zIndex: 40, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
        <div style={{ opacity: clamp((it - 1.05) / 0.4), pointerEvents: 'auto', marginTop: 20, display: 'flex', alignItems: 'center', gap: 4, height: 48, boxSizing: 'border-box', borderRadius: 999, border: `1px solid ${navBd}`, background: dark ? 'rgba(20,20,21,.7)' : 'rgba(254,255,254,.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: '0 7px 0 12px', boxShadow: '0 8px 32px rgba(0,0,0,.06)', color: navFg, transition: 'background .6s, border-color .6s, color .6s' }}>
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', textDecoration: 'none', color: navFg }}>
            <span ref={navMarkRef} style={{ display: 'inline-flex', opacity: it >= 1.4 ? 1 : 0 }}><Mark size={26} /></span>Acture
          </a>
          {W >= 760 && (
            <>
              <a href="#ch1" className="hover:opacity-75" style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 999, fontSize: 14, fontWeight: 500, color: navMute, textDecoration: 'none' }}>What it does</a>
              <a href="#faq" className="hover:opacity-75" style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 999, fontSize: 14, fontWeight: 500, color: navMute, textDecoration: 'none' }}>Questions</a>
              <span style={{ width: 1, height: 16, margin: '0 6px', background: navBd }} />
            </>
          )}
          {/* The way out of the site and into the app. */}
          <a href="/app" className="hover:opacity-[.88]" style={{ display: 'flex', alignItems: 'center', flex: 'none', whiteSpace: 'nowrap', gap: 6, height: 34, boxSizing: 'border-box', borderRadius: 999, background: navFg, color: dark ? '#141415' : '#fefffe', padding: '0 12px 0 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none', transition: 'background .6s, color .6s' }}>
            Open Acture <Icon n="arrowR" size={14} />
          </a>
        </div>
      </nav>

      {lt < INTRO_END && <Splash lt={lt} W={W} VH={VH} target={navTarget} />}

      <main id="main">
        {/* ── The story: pinned to the screen while the page scrolls under it ── */}
        <section id="top" ref={storyRef} style={{ position: 'relative', height: `${STORY_VH}vh` }}>
          <div id="ch1" style={{ position: 'absolute', top: '110vh', left: 0, width: 1, height: 1 }} />
          <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', background: dark ? '#141415' : '#fefffe', transition: 'background .6s' }}>
            <div aria-hidden style={{ opacity: F.c === 0 ? clamp((it - 1.3) / 1) : 1, position: 'absolute', left: F.glow.x, top: F.glow.y, width: 900, height: 700, transform: 'translate(-50%,-50%)', background: `radial-gradient(closest-side, ${F.glow.c}, transparent)`, pointerEvents: 'none', transition: 'background .6s' }} />

            {/* Hero */}
            <div style={{ position: 'absolute', zIndex: 3, left: 0, right: 0, top: F.hero.top, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px', opacity: F.hero.op, transform: `translateY(${F.hero.ty}px)`, pointerEvents: F.hero.op > 0.5 ? 'auto' : 'none' }}>
              <h1 aria-label={heroLine} style={{ margin: 0, maxWidth: 980, fontSize: F.narrow ? 'clamp(38px,10vw,56px)' : 'clamp(48px,6.6vw,88px)', fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1, paddingBottom: 8, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '.24em' }}>
                {heroWords.map((t, i) => {
                  const p = eo((it - 1.15 - i * 0.07) / 0.75)
                  return <span key={i} aria-hidden style={{ display: 'inline-block', color: `color-mix(in oklab, #000 ${(100 - (i / Math.max(1, heroWords.length - 1)) * 100).toFixed(0)}%, #6a6a6a)`, opacity: clamp((it - 1.15 - i * 0.07) / 0.45), transform: `translateY(${((1 - p) * 0.45).toFixed(3)}em)`, filter: p >= 1 ? 'none' : `blur(${((1 - p) * 12).toFixed(1)}px)` }}>{t}</span>
                })}
              </h1>
              <p style={{ ...fadeUp(1.75), margin: '16px 0 0', maxWidth: 540, fontSize: 'clamp(16px,1.6vw,19px)', lineHeight: 1.5, color: '#4a4a48', textWrap: 'pretty' }}>
                A calm to-do list you talk to. It plans your day, then learns when you really get things done.
              </p>
              <div style={{ ...fadeUp(1.9), display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 }}>
                <a href="/app" className="hover:opacity-[.88]" style={BTN_DARK}>Open Acture</a>
                <a href="/login" className="hover:!bg-[#f7f7f5]" style={BTN_LIGHT}>Start today</a>
              </div>
              <p style={{ ...fadeUp(2.1), margin: '12px 0 0', fontSize: 13, color: '#6b6a66' }}>Scroll, and watch a day happen.</p>
            </div>

            {/* The chapters' words */}
            {F.texts.map((tx) => (
              <div key={tx.k} style={{ position: 'absolute', left: tx.left, top: tx.top, width: tx.width, transform: tx.tf, opacity: tx.op, textAlign: tx.align, color: tx.fg, pointerEvents: 'none' }} aria-hidden={tx.op < 0.5}>
                <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: tx.kc }}>{tx.k}</div>
                <h2 style={{ margin: '12px 0 0', fontSize: tx.fs, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, textWrap: 'balance' }}>{tx.h}</h2>
                <p style={{ margin: '14px 0 0', fontSize: 16.5, lineHeight: 1.5, color: tx.pc, textWrap: 'pretty' }}>{tx.p}</p>
                {tx.showDevices && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, fontSize: F.narrow ? 13 : 14, color: tx.pc }}>
                    <span><b style={{ color: tx.fg }}>Mac &amp; Windows</b> · Chrome: Install, in the address bar.</span>
                    <span><b style={{ color: tx.fg }}>Android</b> · Chrome: ⋮ → Install app.</span>
                  </div>
                )}
              </div>
            ))}

            {/* The end of the story */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: F.end.top, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px', opacity: F.end.op, transform: `translateY(${(1 - F.end.op) * 20}px)`, pointerEvents: F.end.op > 0.5 ? 'auto' : 'none' }}>
              <h2 style={{ margin: 0, maxWidth: 760, fontSize: 'clamp(36px,5.6vw,68px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, background: 'linear-gradient(90deg,#000,#6a6a6a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textWrap: 'balance', paddingBottom: 4 }}>Your to-dos won’t say themselves.</h2>
              <p style={{ margin: '14px 0 0', fontSize: 16.5, color: '#4a4a48' }}>Free while it’s being built. Approved accounts sign in with Google.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 22 }}>
                <a href="/app" className="hover:opacity-[.88]" style={BTN_DARK}>Open Acture</a>
                <a href="#faq" className="hover:!bg-[#f7f7f5]" style={BTN_LIGHT}>Questions ↓</a>
              </div>
            </div>

            {/* The whiteboard photo */}
            <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, zIndex: 4, width: 210, transform: F.photo.tf, transformOrigin: 'center', opacity: F.photo.op, pointerEvents: 'none' }}>
              <div style={{ borderRadius: 10, background: '#f7f6f1', padding: '14px 16px 24px', boxShadow: '0 18px 40px rgba(0,0,0,.16)', outline: '1px solid rgba(0,0,0,.05)' }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(0,0,0,.4)' }}>whiteboard.jpg</p>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, fontFamily: "'Bradley Hand','Segoe Print','Comic Sans MS',cursive", fontSize: 15, color: '#1d4ed8' }}><span>lab report → thurs!!</span><span>book flights</span><span>mtg w/ Sara fri 2pm</span></div>
              </div>
            </div>

            {/* The device */}
            <Device F={F} />

            {/* The learning card */}
            <div aria-hidden style={{ position: 'absolute', zIndex: 3, left: F.learn.x, top: F.learn.y, width: F.learn.w, opacity: F.learn.op, transform: `translateY(${F.learn.ty}px)`, pointerEvents: 'none' }}>
              <div style={{ borderRadius: 14, background: '#fff', padding: 6, boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 24px 60px rgba(0,0,0,.2)', outline: '1px solid #dcdad5' }}>
                <div style={{ borderRadius: 10, background: '#fefffe', padding: '14px 14px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>Gym <Icon n="repeat" size={13} color="rgba(107,106,102,.75)" /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 500, color: '#d97706' }}><Icon n="flame" size={13} color="#d97706" />12</span></span>
                    <span style={{ fontSize: 12, color: '#6b6a66' }}>last two weeks</span>
                  </div>
                  <div style={{ marginTop: 8 }}><LearnChart dotsP={F.learn.dotsP} curveP={F.learn.curveP} /></div>
                </div>
              </div>
            </div>

            {/* Keys (chapter 6) */}
            <div aria-hidden style={{ position: 'absolute', zIndex: 3, left: F.Pz.cx, top: F.Pz.cy + F.Pz.h / 2 + 18, transform: 'translateX(-50%)', display: 'flex', gap: 10, opacity: F.keysOn ? 1 : 0, transition: 'opacity .4s', pointerEvents: 'none' }}>
              {F.keycaps.map((k) => (
                <div key={k.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ minWidth: 44, height: 40, boxSizing: 'border-box', padding: '0 11px', borderRadius: 9, border: '1px solid #d4d1cb', background: k.active ? '#F5A524' : '#fff', boxShadow: k.active ? 'none' : '0 2px 0 #c9c6c0, 0 3px 8px rgba(0,0,0,.06)', transform: k.active ? 'translateY(2px)' : 'none', display: 'grid', placeItems: 'center', fontSize: 13.5, fontWeight: 600, color: '#1b1c1f', transition: 'all .15s' }}>{k.k}</span>
                  <span style={{ fontSize: 11.5, color: '#6b6a66', whiteSpace: 'nowrap' }}>{k.l}</span>
                </div>
              ))}
            </div>

            {/* Palettes (chapter 7) */}
            <div aria-hidden style={{ position: 'absolute', zIndex: 3, left: F.Pz.cx, top: F.Pz.cy + F.Pz.h / 2 + 20, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 999, background: '#fff', border: '1px solid #dcdad5', boxShadow: '0 10px 30px rgba(0,0,0,.08)', opacity: F.palsOn ? 1 : 0, transition: 'opacity .4s', pointerEvents: 'none' }}>
              {PAL.map((p, i) => <span key={p[0]} style={{ width: 22, height: 22, borderRadius: '50%', background: p[1], boxShadow: i === F.palIdx && F.c === 7 ? '0 0 0 2px #fff, 0 0 0 4px #1b1c1f' : 'none', transition: 'box-shadow .2s' }} />)}
              <span style={{ marginLeft: 4, fontSize: 13, fontWeight: 600, minWidth: 52 }}>{PAL[F.palIdx][0]}</span>
            </div>

            {/* Which chapter */}
            <div aria-hidden style={{ position: 'absolute', left: 24, bottom: 22, zIndex: 3, display: 'flex', alignItems: 'center', gap: 12, opacity: F.chap.on ? 1 : 0, transition: 'opacity .4s', color: dark ? '#bdbab4' : '#6b6a66' }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{F.chap.n} / 08</span>
              <span style={{ position: 'relative', width: 80, height: 2, borderRadius: 2, background: dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.1)', overflow: 'hidden' }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${F.chap.pct.toFixed(1)}%`, background: '#F5A524' }} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{F.chap.l}</span>
            </div>
          </div>
        </section>

        {/* ── Questions ── */}
        <section id="faq" style={{ padding: 'clamp(80px,10vw,128px) 24px', background: '#f7f7f5', borderTop: '1px solid #ebe9e5', scrollMarginTop: 80 }}>
          <div ref={faqRef} style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '40px 72px', alignItems: 'flex-start', opacity: faqSeen ? 1 : 0.001, transform: faqSeen ? 'none' : 'translateY(24px)', transition: 'opacity .9s, transform 1.1s cubic-bezier(.32,.72,0,1)' }}>
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 110 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(36px,5vw,56px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>Questions,<br />answered.</h2>
              <p style={{ margin: 0, maxWidth: 340, fontSize: 16, lineHeight: 1.5, color: '#4a4a48' }}>The straight version, including what it doesn’t do yet.</p>
            </div>
            <div style={{ flex: '1.5 1 480px', minWidth: 0, borderTop: '1px solid #dcdad5' }}>
              {FAQ.map((fq, i) => {
                const o = faqOpen === i
                return (
                  <div key={fq.q} style={{ borderBottom: '1px solid #dcdad5' }}>
                    <button
                      onClick={() => setFaqOpen((x) => (x === i ? -1 : i))}
                      aria-expanded={o}
                      aria-controls={`faq-a-${i}`}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 18, padding: '22px 2px', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#1b1c1f', font: 'inherit' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: o ? '#b45309' : '#a6a39e', fontVariantNumeric: 'tabular-nums', transition: 'color .3s' }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ flex: 1, fontSize: 'clamp(17px,1.6vw,20px)', fontWeight: 600, letterSpacing: '-0.015em' }}>{fq.q}</span>
                      <span aria-hidden style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: o ? '#1b1c1f' : 'rgba(28,29,32,.06)', color: o ? '#fefffe' : '#1b1c1f', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 400, lineHeight: 1, transform: o ? 'rotate(45deg)' : 'none', transition: 'transform .35s cubic-bezier(.32,.72,0,1), background .3s, color .3s' }}>+</span>
                    </button>
                    <div id={`faq-a-${i}`} style={{ display: 'grid', gridTemplateRows: o ? '1fr' : '0fr', transition: 'grid-template-rows .45s cubic-bezier(.32,.72,0,1)' }}>
                      <div style={{ overflow: 'hidden', minHeight: 0 }}>
                        <p style={{ margin: 0, padding: '0 56px 24px 34px', fontSize: 16, lineHeight: 1.6, color: '#4a4a48', textWrap: 'pretty', opacity: o ? 1 : 0, transition: 'opacity .4s' }}>{fq.a}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── The door ── */}
        <section id="open" style={{ position: 'relative', padding: 'clamp(96px,12vw,150px) 24px 0', background: '#141415', color: '#f4f3f0', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: '-20%', width: 900, height: 600, transform: 'translateX(-50%)', background: 'radial-gradient(closest-side, rgba(245,165,36,.22), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Mark size={64} />
            <h2 style={{ margin: '28px 0 0', maxWidth: 780, fontSize: 'clamp(40px,6vw,76px)', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1, textWrap: 'balance' }}>Ready when you are.</h2>
            <p style={{ margin: '16px 0 0', fontSize: 17, color: '#bdbab4' }}>Free while it’s being built. Approved accounts sign in with Google.</p>
            <button onClick={signIn} disabled={signingIn} className="hover:opacity-90 disabled:opacity-60" style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', whiteSpace: 'nowrap', gap: 10, height: 46, boxSizing: 'border-box', marginTop: 30, borderRadius: 10, border: 0, background: '#fefffe', color: '#1b1c1f', padding: '0 18px', fontSize: 16, fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#1b1c1f', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>G</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{signingIn ? 'Redirecting…' : 'Start today'}</span>
            </button>
            {/* Installable here and now: offered when the browser says it can. */}
            {installState?.canPrompt && (
              <button onClick={install} className="hover:text-white" style={{ marginTop: 12, border: 0, background: 'transparent', color: '#bdbab4', fontSize: 14, fontWeight: 500, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Install the app on this device
              </button>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 13.5, color: '#8f8c86' }}>Continue with Google. It takes a second.</p>

          </div>

          <footer style={{ position: 'relative', maxWidth: 1120, margin: 'clamp(96px,12vw,140px) auto 0', paddingTop: 40, borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '36px 64px', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, fontWeight: 700 }}><Mark size={22} />Acture</span>
                <span style={{ fontSize: 14, lineHeight: 1.55, color: '#a6a39e' }}>Things, but it listens. A calm to-do list you talk to, that learns when you really get things done.</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '36px 64px' }}>
                <FooterCol title="The app" links={[['What it does', '#ch1'], ['Questions', '#faq']]} />
                <FooterCol title="Get in" links={[['Open Acture', '/app'], ['Start today', '/login']]} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, maxWidth: 240 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6f6c67' }}>Good to know</span>
                  <span style={{ color: '#a6a39e', lineHeight: 1.5 }}>Private instance, free while it’s being built. What you say or attach is read by OpenAI models, and that’s all it’s used for. Export everything as one JSON file.</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginTop: 48, fontSize: 13, color: '#6f6c67' }}><span>Acture, made in Morocco.</span><span>© {new Date().getFullYear()}</span></div>
            <div aria-hidden style={{ marginTop: 20, fontSize: 'clamp(90px,22vw,300px)', fontWeight: 800, letterSpacing: '-0.07em', lineHeight: 0.78, textAlign: 'center', background: 'linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 85%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', userSelect: 'none', marginBottom: '-0.06em' }}>Acture</div>
          </footer>
        </section>
      </main>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6f6c67' }}>{title}</span>
      {links.map(([l, href]) => <a key={l} href={href} className="hover:!text-white" style={{ color: '#d6d3ce', textDecoration: 'none' }}>{l}</a>)}
    </div>
  )
}

/** The app itself, in whatever shape the story has it: a window, a phone, the icon. */
function Device({ F }: { F: Frame }) {
  const { th, dv, isl } = F
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '3.5px 8px', fontWeight: 500 }
  return (
    <div aria-hidden style={{ opacity: dv.iop, position: 'absolute', left: dv.x, top: dv.y, width: dv.w, height: dv.h, transform: dv.tf, transformOrigin: '50% 50%', willChange: 'transform', borderRadius: dv.r, background: dv.frame, padding: dv.bez, boxSizing: 'border-box', boxShadow: dv.shadow, zIndex: 2 }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: dv.ir, overflow: 'hidden', background: th.bg, color: th.fg, outline: dv.outline, transition: 'background .5s, color .5s' }}>
        {/* Window chrome */}
        <div style={{ height: dv.chromeH, opacity: dv.chromeOp, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', background: th.side, borderBottom: `1px solid ${th.line}`, transition: 'background .5s' }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', flex: 'none' }} /><span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e', flex: 'none' }} /><span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840', flex: 'none' }} />
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 500, color: th.mute }}>Acture</span><span style={{ width: 48 }} />
        </div>
        {/* Phone notch */}
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 84, height: 24, borderRadius: 14, background: '#1c1d20', opacity: dv.notchOp, zIndex: 3 }} />
        <div style={{ display: 'flex', height: `calc(100% - ${dv.chromeH}px)`, opacity: dv.contentOp }}>
          {/* Sidebar */}
          <aside style={{ width: dv.sideW, flex: 'none', overflow: 'hidden', opacity: dv.sideOp, background: th.side, borderRight: `1px solid ${th.line}`, display: 'flex', flexDirection: 'column', transition: 'background .5s' }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', width: 200, padding: '12px 10px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontSize: 13.5, lineHeight: '20px' }}>
              <div style={row}><Icon n="inbox" size={16} color="#0ea5e9" /><span style={{ flex: 1 }}>Inbox</span><span style={{ fontSize: 12, color: th.mute }}>2</span></div>
              <div style={{ height: 12 }} />
              <div style={{ ...row, borderRadius: 6, background: F.sideToday }}><Icon n="star" size={16} color="#fbbf24" fill="#fbbf24" /><span style={{ flex: 1 }}>Today</span><span style={{ fontSize: 12, color: th.mute }}>{F.todayCount}</span></div>
              <div style={row}><Icon n="cal" size={16} color="#f43f5e" /><span>Upcoming</span></div>
              <div style={row}><Icon n="layers" size={16} color="#14b8a6" /><span>Anytime</span></div>
              <div style={row}><Icon n="archive" size={16} color="rgba(180,83,9,.85)" /><span>Someday</span></div>
              <div style={{ height: 12 }} />
              <div style={row}><Icon n="book" size={16} color="#059669" /><span>Logbook</span></div>
              <div style={{ height: 12 }} />
              <div style={{ ...row, fontWeight: 400, borderRadius: 6, background: F.sideProj }}><Ring v={F.projDone} size={14} color={th.mute} /><span style={{ flex: 1 }}>Thesis defence</span></div>
              <div style={{ ...row, marginTop: 12, fontWeight: 700 }}><Icon n="square" size={16} color="#8a8984" /><span>School</span></div>
              <div style={{ ...row, fontWeight: 400 }}><Ring v={0.7} size={14} color="#8a8984" /><span>Compilers</span></div>
              <div style={{ ...row, fontWeight: 400 }}><Ring v={0.2} size={14} color="#8a8984" /><span>Machine Learning</span></div>
            </div>
            <div style={{ flex: 'none', width: 200, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 10px', boxSizing: 'border-box' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, borderRadius: 12, background: th.prim, color: th.primFg, fontSize: 13.5, fontWeight: 600, transition: 'background .5s' }}><Icon n="mic" size={16} /> Quick Capture</div>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: th.chipBg, display: 'grid', placeItems: 'center' }}><Icon n="kb" size={16} /></div>
            </div>
          </aside>

          <div style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {/* Today */}
            <div style={{ position: 'absolute', inset: 0, opacity: F.showProject ? 0 : 1, transition: 'opacity .45s' }}>
              <div style={{ maxWidth: 700, margin: '0 auto', padding: dv.pad, fontSize: 14 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, lineHeight: '28px', letterSpacing: '-0.02em' }}><Icon n="star" size={22} color="#fbbf24" fill="#fbbf24" />Today</h3>
                  <span style={{ flex: 1 }} />
                  <span style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', color: F.sparkOn ? th.primFg : th.mute, background: F.sparkOn ? th.prim : 'transparent', transition: 'all .3s' }}><Icon n="sparkles" size={17} /></span>
                  <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', color: th.mute }}><Icon n="plus" size={18} /></span>
                </header>
                <div style={{ marginBottom: 10, fontSize: 14, color: th.mute }}>Tuesday, 20 October<span style={{ opacity: F.planNote ? 1 : 0, transition: 'opacity .4s' }}> · Gave 4 a time.</span></div>
                {/* The evening check-in */}
                <div style={{ overflow: 'hidden', maxHeight: F.checkInBanner ? 160 : 0, opacity: F.checkInBanner ? 1 : 0, transition: 'max-height .5s cubic-bezier(.32,.72,0,1), opacity .35s' }}>
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 8, background: 'rgba(129,140,248,.12)', padding: '10px 12px' }}>
                    <span style={{ marginTop: 2 }}><Icon n="moon" size={16} color="#818cf8" /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>How did today go?</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.72 }}>Tell Acture what you got done and when. It learns your days from this.</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 6, background: '#e0a33e', color: '#2f3035', padding: '3px 10px', fontSize: 13, fontWeight: 600 }}><Icon n="mic" size={14} /> Tell it</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 6, border: '1px solid rgba(255,255,255,.16)', padding: '3px 10px', fontSize: 13, fontWeight: 500 }}><Icon n="kb" size={14} /> Type it</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Events */}
                <div style={{ margin: '6px 0 8px', borderRadius: 6, background: th.ev, padding: '6px 10px', fontSize: 13, lineHeight: '19px', transition: 'background .5s' }}>
                  {([['10:00', 'Compilers lecture', 'B12'], ['14:00', 'Café shift', '']] as const).map(([t, n, loc]) => (
                    <div key={t} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ width: 3, height: 11, alignSelf: 'center', borderRadius: 2, background: 'rgba(14,165,233,.7)' }} />
                      <span style={{ fontWeight: 500, color: th.evC }}>{t}</span><span>{n}</span>{loc && <span style={{ color: th.mute }}>· {loc}</span>}
                    </div>
                  ))}
                </div>
                {F.rows.map((r, i) => <TodoRow key={r.key} r={r} th={th} visible={F.rowIn[i]} />)}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginTop: 24, marginBottom: 4, paddingBottom: 6, borderBottom: `1px solid ${th.line}`, color: th.eve }}><Icon n="moon" size={15} />This evening</div>
                {F.eRows.map((r) => <TodoRow key={r.key} r={r} th={th} />)}
              </div>
            </div>

            {/* The project */}
            <div style={{ position: 'absolute', inset: 0, opacity: F.showProject ? 1 : 0, transition: 'opacity .45s' }}>
              <div style={{ maxWidth: 640, margin: '0 auto', padding: dv.pad, fontSize: 14 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, lineHeight: '28px', letterSpacing: '-0.02em' }}><Ring v={F.projDone} size={22} color={th.prim} />Thesis defence</h3>
                  <span style={{ color: th.mute }}><Icon n="ellipsis" size={18} /></span>
                </header>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, color: th.mute }}><span>School</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f59e0b' }}><Icon n="flag" size={12} color="#f59e0b" />Due Mon 26</span></div>
                <p style={{ margin: '6px 0 8px', color: th.mute }}>Three things the room should remember. Nothing else.</p>
                {F.proj.map((e, i) => 'heading' in e
                  ? <div key={'h' + i} style={{ fontSize: 14, fontWeight: 700, marginTop: 22, marginBottom: 4, paddingBottom: 6, borderBottom: `1px solid ${th.line}` }}>{e.heading}</div>
                  : <TodoRow key={e.row.key} r={e.row} th={th} bg={e.selected ? 'rgba(245,165,36,.2)' : 'transparent'} />)}
              </div>
              {F.quickFind && (
                <div style={{ position: 'absolute', left: '50%', top: 48, transform: 'translateX(-50%)', width: 'min(340px,88%)', borderRadius: 12, border: '1px solid #dcdad5', background: '#fff', color: '#1b1c1f', boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 6, zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #ebe9e5', fontSize: 15 }}><Icon n="search" size={16} color="#6b6a66" /><span>reh</span><span style={{ width: 1.5, height: 18, background: '#1b1c1f', animation: 'acture-blink 1s steps(1) infinite' }} /></div>
                  <div style={{ padding: '7px 10px', fontSize: 14, borderRadius: 7, background: 'rgba(28,29,32,.07)' }}>Time a full rehearsal</div>
                </div>
              )}
            </div>

            {/* The island */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none' }}>
              <div style={{ width: isl.wide ? 'min(560px, 100%)' : 'min(500px, 100%)', maxWidth: '100%', boxSizing: 'border-box', borderRadius: 25, border: `1px solid ${isl.bd}`, background: isl.bg, color: isl.fg, boxShadow: '0 1px 2px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.22)', overflow: 'hidden', opacity: isl.on ? 1 : 0, transform: isl.on ? 'none' : 'translateY(16px) scale(.97)', transition: 'opacity .3s, transform .4s cubic-bezier(.32,.72,0,1), background .5s' }}>
                {isl.listen && (
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ position: 'relative', width: 46, height: 46, flex: 'none' }}>
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isl.ping, animation: 'acture-ping 1.2s cubic-bezier(0,0,.2,1) infinite' }} />
                      <span style={{ position: 'relative', width: 46, height: 46, borderRadius: '50%', background: isl.mic, color: isl.micFg, display: 'grid', placeItems: 'center' }}><Icon n="mic" size={20} /></span>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: 24, marginBottom: 2, display: 'flex', alignItems: 'center' }}><Wave n={14} color={isl.waveC} height={22} /></div>
                      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>{isl.said}</p>
                    </div>
                  </div>
                )}
                {isl.compose && (
                  <div style={{ padding: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 2px' }}>
                      <Thumb size={52} /><span style={{ fontSize: 12.5, opacity: 0.6 }}>whiteboard.jpg</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 2px 10px' }}>
                      <span style={{ flex: 1, fontSize: 14, opacity: 0.45 }}>Say what it is about, or just send</span>
                      <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', opacity: 0.6 }}><Icon n="mic" size={16} /></span>
                      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#1c1d20', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon n="arrowUp" size={16} /></span>
                    </div>
                  </div>
                )}
                {isl.talk && (
                  <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 500, opacity: 0.6 }}>Assistant</div>
                    {isl.userText && <div style={{ alignSelf: 'flex-end', maxWidth: '88%', borderRadius: '16px 16px 6px 16px', background: isl.bubble, padding: '8px 14px', fontSize: 13.5, lineHeight: 1.55 }}>{isl.full}</div>}
                    {isl.userImg && <div style={{ alignSelf: 'flex-end' }}><Thumb size={58} /></div>}
                    <div style={{ fontSize: 14, lineHeight: 1.55, opacity: isl.replyOp, transition: 'opacity .3s' }}>{isl.reply}</div>
                  </div>
                )}
              </div>
            </div>
            {/* A phone's + button */}
            <div style={{ position: 'absolute', right: 16, bottom: 20, width: 54, height: 54, borderRadius: '50%', background: th.prim, color: th.primFg, display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(0,0,0,.25)', opacity: dv.plusOp, transition: 'background .5s' }}><Icon n="plus" size={26} /></div>
          </div>
        </div>
        {/* The app icon, at the very end */}
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#141413', opacity: dv.iconOp, pointerEvents: 'none' }}><Mark size={Math.max(40, dv.w)} /></div>
      </div>
    </div>
  )
}

/** A photo of the whiteboard, small: three lines of blue marker. */
function Thumb({ size }: { size: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 12, background: '#f7f6f1', outline: '1px solid rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column', gap: size > 55 ? 4 : 3, padding: size > 55 ? 10 : '9px 8px', boxSizing: 'border-box' }}>
      {[80, 60, 70].map((w) => <span key={w} style={{ height: 3, width: `${w}%`, background: '#1d4ed8', borderRadius: 2, opacity: 0.7 }} />)}
    </span>
  )
}
