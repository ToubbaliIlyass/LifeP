'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { HandoffShell } from '../HandoffShell'

/*
 * Step 1 of signing in to the Mac app, opened in the person's own browser
 * by the app (desktop/main.js): Google refuses to sign in inside an app's
 * own window, so it happens here instead, and comes back through
 * /auth/callback to /auth/desktop/finish.
 */
export default function DesktopStart() {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/auth/desktop/finish` },
    }).then(({ error }) => { if (error) setError(error.message) })
  }, [])
  return (
    <HandoffShell title={error ? 'Couldn’t start sign-in' : 'Signing in to the Mac app…'}>
      {error ?? 'Taking you to Google.'}
    </HandoffShell>
  )
}
