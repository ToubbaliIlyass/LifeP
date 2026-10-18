import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

/**
 * Where Google sends the user back to. Exchanges the one-time code for a
 * session, then checks the account is actually allowed here before letting
 * them in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No authorization code returned')}`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // A valid Google account is not the same as a permitted one. getCurrentUser
  // returns null for anyone outside the allowlist, in which case the session
  // is thrown away rather than left lying around.
  const user = await getCurrentUser()
  if (!user) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('That account is not permitted to use this instance.')}`,
    )
  }

  // Where it goes next: the app, or — signing in for the Mac app, which
  // cannot do it in its own window — the page that hands the session to it.
  // Only that one page is accepted, so this cannot be pointed elsewhere.
  const next = searchParams.get('next') === '/auth/desktop/finish' ? '/auth/desktop/finish' : '/app'
  return NextResponse.redirect(`${origin}${next}`)
}
