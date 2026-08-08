/**
 * Dates are formatted with an explicit locale and timezone, never with the
 * ambient ones. `toLocaleDateString()` with no arguments resolves differently
 * on the server and in the browser, which produces a hydration mismatch that
 * only shows up for readers in a timezone the developer does not live in.
 */
const READABLE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** e.g. "06 Aug 2026" — reads as a recorded date, not a relative one. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : READABLE.format(date)
}

/** ISO date portion, for <time datetime> and for the stamp's serial line. */
export function isoDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}
