'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { ActureMark } from '@/components/ui/acture-mark'

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
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center">
          <ActureMark className="w-[21px] h-[21px] text-foreground" />
        </div>
        <span className="text-[26px] font-bold tracking-tight">Acture</span>
      </div>

      <p className="text-[14px] font-serif text-muted-foreground/80 mb-8 text-center max-w-[34ch]">
        Where action meets structure. Sign in to reach your graph.
      </p>

      <button
        onClick={signIn}
        disabled={busy}
        className="flex items-center gap-3 px-5 py-3 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors text-[14px] font-medium disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {error && (
        <p className="mt-5 text-[12px] text-destructive max-w-[40ch] text-center">{error}</p>
      )}

      <p className="mt-10 text-[11px] font-mono text-muted-foreground/50 text-center max-w-[40ch]">
        This is a private instance. Only approved accounts can sign in.
      </p>
    </div>
  )
}
