import { getCurrentUser, unauthorized } from '@/lib/auth/getCurrentUser'
import { readSettings, writeSettings, type Settings } from '@/lib/settings'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return unauthorized()
  return Response.json({ settings: await readSettings(user.id) })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const body = (await request.json()) as Partial<Settings>
  return Response.json({ ok: true, settings: await writeSettings(user.id, body) })
}
