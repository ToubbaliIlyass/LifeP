/**
 * Storage that can't take the app down.
 *
 * Touching `localStorage`/`sessionStorage` is not guaranteed to work in a
 * browser — iOS Safari throws a `SecurityError` on *any* access (not just
 * writes) when Private Browsing or Settings > Safari > "Block All Cookies"
 * is on, and embedded webviews (Instagram, Messenger) do the same. Because
 * the property getter itself throws, even a bare `sessionStorage.getItem`
 * inside a mount effect is enough to blow up the render and leave the user
 * staring at "This page couldn't load" — which is exactly what happened:
 * the whole app failed to appear on phones with cookies blocked.
 *
 * Every read returns null and every write is a silent no-op when storage is
 * unavailable, so preferences degrade to their defaults instead of taking
 * the page with them. The inline theme script in layout.tsx already guards
 * itself the same way.
 */

type Kind = 'local' | 'session'

function store(kind: Kind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function safeGet(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function safeSet(kind: Kind, key: string, value: string): void {
  try {
    store(kind)?.setItem(key, value)
  } catch {
    // Ignored: a preference we can't persist is not worth an error.
  }
}
