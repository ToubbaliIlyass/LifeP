import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodes, users } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/auth/getCurrentUser'
import { isEmailAllowed } from '@/lib/auth/getCurrentUser'
import { updateNode } from '@/lib/graph/queries'

/**
 * Personal access tokens for the MCP endpoint.
 *
 * An outside chatbot has no Supabase session cookie, so it identifies itself
 * with a token the user generated in Settings. Only a SHA-256 hash is stored
 * (as an ApiToken node, hidden everywhere), so a leaked database row cannot
 * be replayed; the token itself is shown exactly once.
 */

const PREFIX = 'acture_'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(): string {
  return PREFIX + randomBytes(32).toString('base64url')
}

/** Bearer header first; `?token=` for clients that can only be given a URL. */
function tokenFrom(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim()
  return new URL(request.url).searchParams.get('token')
}

export async function authenticateMcp(request: Request): Promise<CurrentUser | null> {
  const token = tokenFrom(request)
  if (!token || !token.startsWith(PREFIX)) return null
  const hash = hashToken(token)

  const candidates = await db.select().from(nodes).where(eq(nodes.type, 'ApiToken')).all()
  const match = candidates.find((n) => (n.properties as Record<string, unknown>).hash === hash)
  if (!match) return null

  const user = await db.select().from(users).where(and(eq(users.id, match.userId))).get()
  // The sign-in allowlist still applies: removing someone from it must cut off
  // their tokens too, not just their browser session.
  if (!user || !isEmailAllowed(user.email)) return null

  // Best effort, so Settings can show which tokens are actually in use.
  updateNode(user.id, match.id, { ...(match.properties as Record<string, unknown>), lastUsedAt: new Date().toISOString() }).catch(() => {})

  return { id: user.id, name: user.name, email: user.email }
}
