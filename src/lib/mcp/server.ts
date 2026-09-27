import { z } from 'zod'
import type { CurrentUser } from '@/lib/auth/getCurrentUser'
import { buildMcpTools, MCP_INSTRUCTIONS } from './tools'
import { logger } from '@/lib/log'

/**
 * A minimal Model Context Protocol server over Streamable HTTP.
 *
 * Hand-written rather than pulled in from the SDK because the useful subset
 * is small — initialize, ping, tools/list, tools/call — and a stateless
 * request → JSON response fits a serverless route with no session store and
 * no long-lived stream. The spec allows a server to answer a POST with plain
 * application/json instead of opening SSE, which is what this does.
 */

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

function jsonSchemaFor(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema
  return json
}

/** Returns null for notifications, which get no reply. */
export async function handleRpc(user: CurrentUser, msg: RpcRequest): Promise<object | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return fail(msg?.id, -32600, 'Invalid request')
  }
  if (msg.id === undefined || msg.id === null) return null

  switch (msg.method) {
    case 'initialize': {
      const requested = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : ''
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'acture', title: 'Acture', version: '1.0.0' },
        instructions: MCP_INSTRUCTIONS,
      })
    }

    case 'ping':
      return ok(msg.id, {})

    case 'tools/list':
      return ok(msg.id, {
        tools: (await buildMcpTools(user)).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: jsonSchemaFor(t.schema),
        })),
      })

    case 'tools/call': {
      const name = msg.params?.name
      const tool = (await buildMcpTools(user)).find((t) => t.name === name)
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${String(name)}`)

      const parsed = tool.schema.safeParse(msg.params?.arguments ?? {})
      if (!parsed.success) {
        // A tool-level error, not a protocol one, so the model sees what was
        // wrong and can retry with better arguments.
        return ok(msg.id, {
          isError: true,
          content: [{ type: 'text', text: `Invalid arguments: ${z.prettifyError(parsed.error)}` }],
        })
      }

      try {
        const result = await tool.run(parsed.data)
        logger.info('mcp_tool_call', { tool: tool.name, userId: user.id })
        return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] })
      } catch (err) {
        logger.info('mcp_tool_failed', { tool: tool.name, error: String(err) })
        return ok(msg.id, { isError: true, content: [{ type: 'text', text: `Acture could not do that: ${String(err)}` }] })
      }
    }

    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}
