'use client'

import { useEffect } from 'react'
import { Tuck } from '@/components/ui/Tuck'

/**
 * When something breaks and the page cannot draw: Tuck, an apology that
 * blames nothing on you, and a way to try again. Shared by the error
 * boundaries of the site and of the app.
 */
export function ErrorScreen({ error, retry, home }: {
  error: Error & { digest?: string }
  retry: () => void
  /** Where "Go home" leads: the site's front page, or the lists. */
  home: { href: string; label: string }
}) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <main className="min-h-dvh grid place-items-center bg-background px-6 text-foreground">
      <div className="flex max-w-[420px] flex-col items-center text-center" role="alert">
        <Tuck state="error" size={220} decorative />
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">Oops, that didn’t work.</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Nothing you’ve added is lost. Let’s try again.</p>
        <div className="mt-5 flex items-center gap-2">
          <button onClick={retry} className="rounded-lg bg-primary px-3.5 py-2 text-[14px] font-semibold text-primary-foreground hover:opacity-90">Try again</button>
          {/* A plain link: the page that failed may be the one this would have routed through. */}
          <a href={home.href} className="rounded-lg px-3.5 py-2 text-[14px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">{home.label}</a>
        </div>
      </div>
    </main>
  )
}
