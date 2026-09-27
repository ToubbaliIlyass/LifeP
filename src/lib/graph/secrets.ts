/**
 * Node types that hold credentials, and must never leave the server.
 *
 * These are ordinary rows in the same table as tasks and notes, because the
 * whole app is one graph — which means every endpoint that answers "give me
 * the nodes" will hand them over unless it is told not to. The graph view was
 * doing exactly that: it filtered these out when *drawing*, so nothing was
 * ever visible on screen, and the plaintext Canvas token was in the JSON
 * behind it the whole time.
 *
 * Hiding in the client is not hiding. The filter belongs at the edge, so
 * add the type here and every route that uses `visibleToClient` is covered.
 */
const SECRET_TYPES = new Set(['ApiToken', 'CanvasCredential'])

export function isSecretType(type: string): boolean {
  return SECRET_TYPES.has(type)
}

/** The nodes a browser may see, whatever it asked for. */
export function visibleToClient<T extends { type: string }>(nodes: T[]): T[] {
  return nodes.filter((n) => !SECRET_TYPES.has(n.type))
}
