/**
 * Dates are formatted with an explicit locale and timezone, never the ambient
 * ones. `toLocaleDateString()` with no arguments resolves differently on the
 * server and in the browser, producing a hydration mismatch that only appears
 * for readers in a timezone the developer does not live in.
 */
const SHEET_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** e.g. "Thursday 6 August 2026" — a broadside dates itself in full. */
export function formatSheetDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : SHEET_DATE.format(date)
}

/** e.g. "6 August 2026". */
export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : SHORT_DATE.format(date)
}

/** ISO date portion, for <time datetime>. */
export function isoDate(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}
