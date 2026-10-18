'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { HandoffShell } from '../HandoffShell'

/*
 * Step 3, inside the Mac app: the session from the browser, arrived in this
 * page's fragment, is set here — in the app's own cookies — and the app
 * opens on the lists. The fragment is cleared first, so the tokens do not
 * stay in the address or the history.
 */
export default function DesktopSession() {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    history.replaceState(null, '', window.location.pathname)
    const access_token = params.get('access_token'), refresh_token = params.get('refresh_token')
    const signIn = access_token && refresh_token
      ? createSupabaseBrowserClient().auth.setSession({ access_token, refresh_token }).then(({ error }) => !error)
      : Promise.resolve(false)
    void signIn.then((ok) => { if (ok) window.location.replace('/app'); else setFailed(true) })
  }, [])
  return failed
    ? <HandoffShell title="Sign-in didn’t come through"><a href="/login" className="underline underline-offset-2">Try again</a></HandoffShell>
    : <HandoffShell title="Signing you in…" />
}
