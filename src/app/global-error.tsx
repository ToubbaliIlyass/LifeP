'use client'

/*
 * The last net: an error in a root layout, where there is no stylesheet or
 * component to lean on. Plain HTML with its own styles, Tuck as a <picture>,
 * and "dark" from the system, as on the not-found page.
 */
export default function GlobalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          :root { color-scheme: light dark; --bg: #fefffe; --fg: #1b1c1f; --muted: #6b6d73; }
          @media (prefers-color-scheme: dark) { :root { --bg: #141415; --fg: #f5f4f2; --muted: #9b9b9f; } }
          body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif; }
          main { max-width: 360px; text-align: center; }
          img { width: 200px; height: auto; }
          h1 { margin: 8px 0 6px; font-size: 22px; letter-spacing: -0.01em; }
          p { margin: 0 0 20px; color: var(--muted); }
          button { font: inherit; font-weight: 600; cursor: pointer; padding: 9px 16px; border: 0; border-radius: 10px; background: var(--fg); color: var(--bg); }
        ` }} />
      </head>
      <body>
        <main role="alert">
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/tuck/svg-dark/error.svg" />
            <img src="/tuck/svg/error.svg" width={200} height={188} alt="Tuck next to a tipped pot, oops" />
          </picture>
          <h1>Oops, that didn’t work.</h1>
          <p>Nothing you’ve added is lost. Let’s try again.</p>
          <button onClick={() => unstable_retry()}>Try again</button>
        </main>
      </body>
    </html>
  )
}
