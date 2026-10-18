import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { sendToUser } from '@/lib/push-server'

/** Settings' "Send a test": proves the whole path, push service to lock screen. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  const r = await sendToUser(user.id, { title: 'Acture', body: 'Reminders will arrive like this, even with Acture closed.', tag: 'acture-test', url: '/app' })
  return Response.json(r)
}
