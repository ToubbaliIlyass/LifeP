import type { MetadataRoute } from 'next'
import { url } from '@/lib/site'

/*
 * The landing page and the few public pages are open; the app, sign-in, the
 * data API and the dev playground are not. (/dev/tuck, /login and /app also
 * carry a noindex meta tag, see app/(app)/layout.tsx; /api and /auth send an
 * X-Robots-Tag header, see next.config.ts.) AI crawlers get the same
 * rules as everyone (public pages open): being quoted accurately is the point.
 */
const PRIVATE = ['/app$', '/app/', '/login', '/api/', '/auth/', '/dev/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: url('/sitemap.xml'),
  }
}
