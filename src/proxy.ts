import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session on every request and keeps unauthenticated
 * traffic out of the app.
 *
 * This is the outer gate. Each API route still checks the session itself —
 * this gate alone is too easy to bypass with a matcher mistake, and the
 * routes are what actually touch personal data.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated the middleware
 * file convention in favour of this one, which always runs on the Node
 * runtime instead of the edge.
 */
/*
 * What needs a signed-in user: the app and its data. Everything else — the
 * site, sign-in itself, and any address that does not exist — is public, so
 * a mistyped or stale URL gets the "nothing here" page with a way home, not a
 * sign-in screen that looks like the whole site is locked.
 */
const PROTECTED = ['/app', '/api']
const isProtected = (pathname: string) =>
  PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Must be called to refresh an expiring token — and getUser() verifies with
  // Supabase rather than trusting whatever the cookie claims.
  const { data } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (!data.user && isProtected(pathname)) {
    // API callers get a status they can act on; browsers get the login page.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (data.user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Everything except Next's own assets and image files — those are not
    // worth a Supabase round trip on each request — and what installing the
    // app fetches, which has to reach a browser that is not signed in yet
    // (the install button is on the public site).
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
