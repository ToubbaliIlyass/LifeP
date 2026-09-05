import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'

/** Who is signed in — used by Settings to show the account and sign out. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } })
}
