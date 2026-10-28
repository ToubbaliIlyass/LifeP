/* eslint-disable @next/next/no-html-link-for-pages -- served outside the router: plain links are what work here */
import type { Metadata } from 'next'

/*
 * With two roots — the site and the app, app/(site) and app/(app) — there is
 * no single layout for a missing page to sit in, so this one is whole on its
 * own. It points both ways — home and into the app — since it cannot know
 * which side was meant.
 *
 * Self-contained on purpose: its styles are written here, not imported, and
 * it has no client component and no script. Anything that gave this page a
 * bundle of its own — globals.css, next/font, a <Link> — made the dev server
 * try to load a chunk for it, which failed (Next 16.2, experimental
 * globalNotFound) and took the page down, buttons and all. Plain HTML and
 * plain links need nothing to load. Dark mode comes from the system.
 *
 * Drawn like the site: the same floating bar, the same type and colours, and
 * the miss shown as what Acture knows best, a to-do. Tuck stands over it,
 * in the wrong tunnel — a plain <picture>, so it too needs no script.
 */

export const metadata: Metadata = {
  title: 'Not found · Acture',
}

const css = `
:root {
  color-scheme: light;
  --bg: #fefffe; --fg: oklch(0.13 0.005 255); --card: #fefffe;
  --muted: oklch(0.5 0.01 255); --border: oklch(0.13 0.005 255 / 0.12);
  --grad-from: #000; --grad-to: #666; --tag-fg: #dc2626;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #141415; --fg: oklch(0.97 0.003 75); --card: oklch(0.32 0.004 265);
    --muted: oklch(0.68 0.007 75); --border: oklch(1 0 0 / 13%);
    --grad-from: #fff; --grad-to: #9b9b9b; --tag-fg: #f87171;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  min-height: 100dvh; background: var(--bg); color: var(--fg);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
a { color: inherit; text-decoration: none; }
.logo {
  display: inline-grid; place-items: center; width: 24px; height: 24px;
  border-radius: 28%; background: #141413;
}
.logo svg { width: 66%; height: 66%; }

nav { position: fixed; inset: 0 0 auto 0; display: flex; justify-content: center; padding: 0 16px; z-index: 10; }
.bar {
  margin-top: 24px; display: flex; align-items: center; gap: 8px;
  padding: 8px 8px 8px 12px; border: 1px solid var(--border); border-radius: 999px;
  background: color-mix(in oklab, var(--bg) 80%, transparent);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.06);
}
.brand { display: flex; align-items: center; gap: 8px; padding-right: 8px; font-weight: 700; letter-spacing: -0.01em; }
.open {
  padding: 4px 12px; border-radius: 999px; background: var(--fg); color: var(--bg);
  font-size: 14px; font-weight: 600; transition: opacity .2s;
}
.open:hover { opacity: .9; }

main {
  max-width: 576px; margin: 0 auto; min-height: 100dvh; padding: 112px 24px 64px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
}
.tuck { display: block; width: 168px; height: auto; margin: -8px 0 4px; }
.card {
  width: 100%; max-width: 360px; padding: 20px; text-align: left;
  border: 1px solid var(--border); border-radius: 16px; background: var(--card);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.06);
}
.day { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.day span { color: #f5a524; }
ul { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; font-size: 14.5px; }
li { display: flex; align-items: center; gap: 10px; }
.box { width: 18px; height: 18px; flex: none; border-radius: 5px; border: 1.5px solid color-mix(in oklab, var(--fg) 35%, transparent); }
.done { color: var(--muted); }
.done .text { text-decoration: line-through; text-decoration-color: color-mix(in oklab, var(--muted) 60%, transparent); }
.done .box { display: grid; place-items: center; border: 0; background: var(--fg); color: var(--bg); font-size: 11px; }
.grow { flex: 1; }
.tag { flex: none; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; color: var(--tag-fg); background: rgb(239 68 68 / 0.1); }

h1 {
  margin: 40px 0 0; font-size: clamp(36px, 6vw, 48px); line-height: 1.05; font-weight: 700; letter-spacing: -0.025em;
  background: linear-gradient(to right, var(--grad-from), var(--grad-to));
  -webkit-background-clip: text; background-clip: text; color: transparent; text-wrap: balance;
}
p { margin: 16px 0 0; max-width: 440px; font-size: 16px; line-height: 1.5; color: color-mix(in oklab, var(--fg) 70%, transparent); text-wrap: pretty; }
.ways { margin-top: 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.ways a { padding: 8px 14px; border-radius: 8px; font-size: 16px; font-weight: 500; color: var(--muted); transition: color .2s, background .2s, transform .5s cubic-bezier(.32,.72,0,1), opacity .2s; }
.ways a:hover { color: var(--fg); background: color-mix(in oklab, var(--fg) 5%, transparent); }
.ways a.cta { background: var(--fg); color: var(--bg); font-weight: 600; }
.ways a.cta:hover { transform: translateY(-1px); opacity: .9; }
a:focus-visible { outline: 2px solid #f5a524; outline-offset: 2px; }
`

/* The mark (src/components/ui/acture-mark.tsx), inline: a voice becoming a tick. */
function Logo() {
  return (
    <span className="logo" aria-hidden>
      <svg viewBox="0 0 32 32" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14.5v3" stroke="#F5A524" />
        <path d="M9.5 11.5v9" stroke="#F5A524" />
        <path d="M14 16.5l4 4L27.5 10" stroke="#fff" />
      </svg>
    </span>
  )
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        {/* The site's own bar: the name, and the way into the app. */}
        <nav aria-label="Main">
          <div className="bar">
            <a href="/" className="brand"><Logo />Acture</a>
            <a href="/app" className="open">Open Acture →</a>
          </div>
        </nav>

        <main>
          {/* Tuck, between three tunnels. The dark twin has a light rim, for the dark page. */}
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/tuck/svg-dark/not-found.svg" />
            <img className="tuck" src="/tuck/svg/not-found.svg" width={168} height={158} alt="Tuck, lost between three tunnels" />
          </picture>

          {/* The miss, as a to-do: looked for, and not found. */}
          <div className="card" aria-hidden>
            <div className="day"><span>★</span> Today</div>
            <ul>
              <li className="done"><span className="box">✓</span><span className="text">Look everywhere</span></li>
              <li><span className="box" /><span className="grow">Find this page</span><span className="tag">Not found</span></li>
            </ul>
          </div>

          <h1>This page isn’t on the list.</h1>
          <p>The address may be mistyped, or what was here has moved. Everything else is right where you left it.</p>

          <div className="ways">
            <a href="/" className="cta">Back to home</a>
            <a href="/app">Open Acture</a>
            <a href="/#get">Get the app</a>
          </div>
        </main>
      </body>
    </html>
  )
}
