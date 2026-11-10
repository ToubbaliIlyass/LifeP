/**
 * A sign-in-free test user, for working on the app without touching the real
 * account or its data.
 *
 * Off unless every one of these holds, so it cannot be switched on by
 * accident anywhere that matters:
 *   - `DEV_TEST_LOGIN=1` is set (in .env.local, which is for this machine only);
 *   - this is not a production build (`next dev`, never `next build`/`start`);
 *   - the database is a local `file:` one, never Turso.
 * With those, the proxy lets requests through and getCurrentUser returns the
 * one test user, whose data lives in that local file and nowhere else.
 */
export const DEV_TEST_EMAIL = 'test@acture.local'
export const DEV_TEST_AUTH_ID = 'dev-test-user'

export function devTestLogin(): boolean {
  if (process.env.DEV_TEST_LOGIN !== '1') return false
  if (process.env.NODE_ENV === 'production') return false
  return (process.env.TURSO_DATABASE_URL ?? 'file:./data/lifep.db').startsWith('file:')
}
