import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface CurrentUser {
  id: number
  name: string
  email: string | null
}

/** Emails permitted to sign in. Anyone else is refused, whoever they are. */
function allowedEmails(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = allowedEmails()
  // An empty allowlist denies everyone. Failing closed matters: a typo in the
  // env var on a public deployment must not silently open the app to anyone
  // with a Google account.
  if (allowed.length === 0 || !email) return false
  return allowed.includes(email.toLowerCase())
}

/**
 * The signed-in user, or null.
 *
 * Supabase identifies people by UUID while this database keys everything off
 * an integer userId, so the Supabase identity is linked to a local user row
 * rather than replacing it — existing data keeps the id it already has.
 *
 * The first allowed sign-in claims an unlinked existing row (so the data
 * built up before auth existed stays owned by its actual owner) and only
 * creates a new row if there is nothing to claim. The allowlist is what
 * makes that safe: without it, whoever signed in first would inherit the
 * database.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient()

  // getUser() revalidates the token with Supabase rather than trusting the
  // cookie, which getSession() would.
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  const authId = data.user.id
  const email = data.user.email ?? null

  if (!isEmailAllowed(email)) return null

  const linked = await db.select().from(users).where(eq(users.authId, authId)).get()
  if (linked) return { id: linked.id, name: linked.name, email: linked.email }

  // Not linked yet — claim the earliest row that has no identity attached.
  const unlinked = await db.select().from(users).all()
  const claimable = unlinked.filter((u) => !u.authId).sort((a, b) => a.id - b.id)[0]

  if (claimable) {
    const updated = await db
      .update(users)
      .set({ authId, email })
      .where(eq(users.id, claimable.id))
      .returning()
      .get()
    return { id: updated.id, name: updated.name, email: updated.email }
  }

  const created = await db
    .insert(users)
    .values({ name: data.user.user_metadata?.full_name ?? 'You', authId, email })
    .returning()
    .get()
  return { id: created.id, name: created.name, email: created.email }
}

/**
 * The 401 every API route returns when there is no valid session.
 *
 * The proxy already turns anonymous /api traffic away, but each route
 * checks too: a single mistake in the proxy matcher should not be
 * enough to expose personal data.
 */
export function unauthorized(): Response {
  return Response.json({ error: 'Not authenticated' }, { status: 401 })
}
