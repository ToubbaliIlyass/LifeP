import { authenticateMcp } from '@/lib/mcp/auth'
import { handleRpc } from '@/lib/mcp/server'

/**
 * MCP endpoint for outside chatbots (Claude, ChatGPT, Cursor…).
 *
 * Public at the proxy — these clients carry no session cookie — and
 * authenticated here by personal access token instead. See
 * docs/connect-your-ai.md for how to connect each client.
 */

export async function POST(request: Request) {
  const user = await authenticateMcp(request)
  if (!user) {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid Acture token. Create one in Acture → Settings → Connect your AI.' } },
      {
        status: 401,
        // Says what kind of credential is wanted. Without it, a client that
        // has just been refused assumes OAuth and goes hunting for metadata
        // that does not exist, and the user is told "connection closed"
        // rather than "your token did not arrive".
        headers: { 'WWW-Authenticate': 'Bearer realm="Acture", error="invalid_token"' },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 })
  }

  const batch = Array.isArray(body)
  const messages = (batch ? body : [body]) as Parameters<typeof handleRpc>[1][]
  const replies = (await Promise.all(messages.map((m) => handleRpc(user, m)))).filter(Boolean)

  // Only notifications in the request: acknowledged, nothing to say.
  if (replies.length === 0) return new Response(null, { status: 202 })
  return Response.json(batch ? replies : replies[0])
}

/** No server-initiated stream is offered; clients fall back to plain POSTs. */
export function GET() {
  return new Response('Acture MCP endpoint — send JSON-RPC with POST.', { status: 405, headers: { Allow: 'POST' } })
}
