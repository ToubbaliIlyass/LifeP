import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Supabase is used here for authentication only — the application's data
 * lives in Turso. All this client ever does is establish *who* is asking.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server components cannot set cookies. That is fine: the
            // proxy refreshes the session on every request, so the
            // tokens are already current by the time we get here.
          }
        },
      },
    },
  )
}
