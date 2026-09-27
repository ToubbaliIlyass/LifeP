/**
 * The greeting at the top of an empty chat.
 *
 * Pure and hour-in, so every branch can be checked without waiting for the
 * afternoon — which matters here, because the bug this replaces was not in
 * the branching at all. `getGreeting()` was called during render in a page
 * Next prerenders statically, so it ran once at `next build` and shipped
 * that one answer to every visitor forever: build in the morning and it is
 * good morning at midnight. See useGreeting, which only ever asks the
 * browser's own clock.
 */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 23) return 'Good evening'
  return 'Still up'
}
