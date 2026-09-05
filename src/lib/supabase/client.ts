'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for the browser. Only used to start the Google OAuth
 * redirect and to read the current session in client components — never to
 * read application data, which lives in Turso behind the API routes.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
