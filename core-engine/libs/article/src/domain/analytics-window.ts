/**
 * Time windows for dashboard analytics. Pure — no clock, no I/O: `now` and the
 * time zone are always passed in (core-engine/CLAUDE.md, "Time").
 *
 * Instants are stored UTC everywhere; the time zone only decides where a DAY
 * begins. It is the backoffice viewer's own zone (decision D5 in
 * docs/proposals/dashboard-analytics-umami.md), so "yesterday" means the
 * editor's yesterday, not the server's.
 *
 * Built on Intl rather than a date library: the platform has the zone database
 * already, and these five functions are the whole requirement.
 */

export type AnalyticsRange = '7d' | '30d' | '90d';

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ['7d', '30d', '90d'];

const RANGE_DAYS: Record<AnalyticsRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

export interface TimeSpan {
  from: Date;
  to: Date;
}

export interface AnalyticsWindow {
  range: AnalyticsRange;
  timezone: string;
  /** Every local date in `current`, oldest first, as YYYY-MM-DD. */
  days: string[];
  current: TimeSpan;
  /** Immediately before `current`, and exactly as long — see analyticsWindow. */
  previous: TimeSpan;
}

/** True for any IANA zone this runtime knows. Unknown zones must be refused, not defaulted. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  }
  catch {
    return false;
  }
}

/** The YYYY-MM-DD an instant falls on in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Calendar arithmetic on a YYYY-MM-DD string. Zone-free on purpose. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Milliseconds `timeZone` is ahead of UTC at `instant` (negative west of UTC). */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which local date `date` begins in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the first guess can differ from the offset at
  // the answer when a DST change falls between them.
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** Every local date a span touches, oldest first. `to` is exclusive. */
export function localDaysIn(span: TimeSpan, timeZone: string): string[] {
  const last = localDate(new Date(span.to.getTime() - 1), timeZone);
  const days: string[] = [];
  for (let day = localDate(span.from, timeZone); day <= last; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * The window a dashboard range covers, and the one it is compared against.
 *
 * `current` runs from local midnight N−1 days ago up to `now`, so today counts
 * even though it is not over. `previous` starts N days earlier and runs for
 * EXACTLY as long as `current` has so far — comparing a 29.4-day window
 * against a full 30 would make every morning look like a decline.
 */
export function analyticsWindow(range: AnalyticsRange, now: Date, timeZone: string): AnalyticsWindow {
  const n = RANGE_DAYS[range];
  const firstDay = addDays(localDate(now, timeZone), -(n - 1));
  const currentFrom = startOfLocalDay(firstDay, timeZone);
  const previousFrom = startOfLocalDay(addDays(firstDay, -n), timeZone);
  const elapsed = now.getTime() - currentFrom.getTime();

  return {
    range,
    timezone: timeZone,
    days: Array.from({ length: n }, (_, i) => addDays(firstDay, i)),
    current: { from: currentFrom, to: now },
    previous: { from: previousFrom, to: new Date(previousFrom.getTime() + elapsed) },
  };
}
