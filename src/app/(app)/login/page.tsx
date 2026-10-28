'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Tuck } from '@/components/ui/Tuck'

function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export default function LoginPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground px-6">
      <div className="w-full max-w-[340px]">
        {/* Signing in is asking for a key: Tuck holds one up. */}
        <Tuck state="permission-key" size={190} alt="Tuck holding up a key" className="-ml-4 mb-1" />
        <h1 className="text-[22px] font-bold leading-7 tracking-tight">Acture</h1>
        <p className="mt-1 mb-6 text-[14px] text-foreground/75">
          Say what needs to happen. It becomes your to-dos, and finds them a time.
        </p>

        <button
          onClick={signIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-md border border-border/80 bg-card hover:bg-foreground/[0.04] transition-colors text-[14px] font-medium disabled:opacity-60"
        >
          <GoogleMark />
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {error && <p className="mt-4 text-[13px] text-red-500">{error}</p>}

        <p className="mt-8 text-[12.5px] text-muted-foreground">
          A private instance: only approved accounts can sign in.
        </p>
      </div>
    </div>
  )
}
