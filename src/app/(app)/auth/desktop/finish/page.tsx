'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { HandoffShell } from '../HandoffShell'

/*
 * Step 2, still in the browser: signed in, so hand the session to the Mac
 * app through its acture:// link. The tokens ride in the link's fragment,
 * which never reaches any server; the app opens /auth/desktop/session with
 * them, and this tab can be closed.
 */
export default function DesktopFinish() {
  const [link, setLink] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void createSupabaseBrowserClient().auth.getSession().then(({ data }) => {
      const s = data.session
      if (!s) { setFailed(true); return }
      const l = `acture://auth#access_token=${encodeURIComponent(s.access_token)}&refresh_token=${encodeURIComponent(s.refresh_token)}`
      setLink(l)
      window.location.href = l
    })
  }, [])
  if (failed) return <HandoffShell title="Not signed in">Go back to the Mac app and try again.</HandoffShell>
  return (
    <HandoffShell title="Opening Acture…">
      <p>You’re signed in. Acture should open by itself; you can close this tab.</p>
      {link && <a href={link} className="inline-block mt-5 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-[14px] font-semibold">Open Acture</a>}
    </HandoffShell>
  )
}
