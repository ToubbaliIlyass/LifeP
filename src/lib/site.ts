/*
 * The one place that knows where Acture lives on the web.
 *
 * Every canonical, sitemap entry, robots line, JSON-LD @id and llms.txt link
 * is built from here, so a change of host is a one-line (or one env var)
 * change. The fallback is the address the repo itself already uses for the
 * live app (docs/reminders.md, src/lib/push-server.ts): the landing page and
 * the app are one deployment. Set NEXT_PUBLIC_SITE_URL in Vercel if the
 * public host differs; it must name the host that answers 200, not one that
 * redirects.
 */
const FALLBACK_ORIGIN = 'https://app.acture.co'

function normalise(raw: string | undefined): string {
  const v = (raw ?? '').trim().replace(/\/+$/, '')
  if (!v) return FALLBACK_ORIGIN
  try {
    const u = new URL(v)
    return u.origin
  } catch {
    return FALLBACK_ORIGIN
  }
}

export const SITE_ORIGIN = normalise(process.env.NEXT_PUBLIC_SITE_URL)

/** An absolute URL on the canonical host. */
export const url = (path = '/') => `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`

export const BRAND = {
  name: 'Acture',
  tagline: 'Things, but it listens',
  /** One sentence, used for descriptions where a short one is needed. */
  summary: 'A calm to-do list you talk to. It turns what you say into to-dos, finds each one a time, and learns when you really get things done.',
} as const

/** The public pages that are indexed. One owner per query: see docs/seo/keyword-map.md. */
export const PUBLIC_PATHS = ['/', '/voice-to-do-list', '/day-planner', '/things-alternative'] as const
