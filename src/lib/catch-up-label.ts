/** "tomorrow", a weekday within the week, or the date: where the pile ends. */
export function dayName(date: string, today: string): string {
  const a = Date.parse(date + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  const days = Math.round((a - b) / 86_400_000)
  if (days <= 1) return 'tomorrow'
  if (days < 7) return new Date(a).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return new Date(a).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
