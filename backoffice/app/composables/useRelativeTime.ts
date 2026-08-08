/**
 * "3 hours ago" from an ISO 8601 UTC string.
 *
 * SSR SAFETY: this is computed on both server and client from the same input,
 * and "now" differs between them by however long the response took. That is a
 * hydration mismatch waiting to happen for anything under a minute, which is
 * why sub-minute times collapse to a constant "just now" rather than counting
 * seconds.
 *
 * Uses Intl.RelativeTimeFormat rather than a date library — it is built in,
 * localises properly, and this is the only date formatting the admin needs.
 */
const DIVISIONS: { amount: number, unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

export function useRelativeTime() {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  function relative(iso: string | null): string {
    if (!iso) return '—'

    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return '—'

    let duration = (then - Date.now()) / 1000

    // Anything within the last minute reads as "just now" on both server and
    // client, so SSR and hydration agree.
    if (Math.abs(duration) < 60) return 'just now'

    for (const division of DIVISIONS) {
      if (Math.abs(duration) < division.amount) {
        return formatter.format(Math.round(duration), division.unit)
      }
      duration /= division.amount
    }

    return '—'
  }

  /** Absolute date for a `title` attribute — the precise value on hover. */
  function absolute(iso: string | null): string {
    if (!iso) return ''
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '' : date.toUTCString()
  }

  return { relative, absolute }
}
