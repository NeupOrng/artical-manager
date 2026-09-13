import { describe, it, expect } from 'vitest';
import {
  addDays,
  analyticsWindow,
  isValidTimeZone,
  localDate,
  localDaysIn,
  startOfLocalDay,
} from './analytics-window';

describe('localDate', () => {
  it('is the date in the given zone, not in UTC', () => {
    const instant = new Date('2026-09-12T20:00:00Z'); // 03:00 on the 13th in Phnom Penh
    expect(localDate(instant, 'UTC')).toBe('2026-09-12');
    expect(localDate(instant, 'Asia/Phnom_Penh')).toBe('2026-09-13');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('startOfLocalDay', () => {
  it('is local midnight expressed in UTC', () => {
    expect(startOfLocalDay('2026-09-07', 'Asia/Phnom_Penh').toISOString())
      .toBe('2026-09-06T17:00:00.000Z');
    expect(startOfLocalDay('2026-09-07', 'UTC').toISOString())
      .toBe('2026-09-07T00:00:00.000Z');
  });

  it('follows DST — New York springs forward on 2026-03-08', () => {
    expect(startOfLocalDay('2026-03-08', 'America/New_York').toISOString())
      .toBe('2026-03-08T05:00:00.000Z'); // still EST
    expect(startOfLocalDay('2026-03-09', 'America/New_York').toISOString())
      .toBe('2026-03-09T04:00:00.000Z'); // now EDT
  });
});

describe('localDaysIn', () => {
  it('lists every local day a span touches, end exclusive', () => {
    const span = {
      from: new Date('2026-09-10T00:00:00Z'),
      to: new Date('2026-09-13T00:00:00Z'),
    };
    expect(localDaysIn(span, 'UTC')).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
  });
});

describe('analyticsWindow', () => {
  const now = new Date('2026-09-12T15:04:00Z');

  it('covers N local days ending today', () => {
    const w = analyticsWindow('30d', now, 'UTC');
    expect(w.days).toHaveLength(30);
    expect(w.days.at(-1)).toBe('2026-09-12');
    expect(w.days[0]).toBe('2026-08-14');
    expect(w.current.from.toISOString()).toBe('2026-08-14T00:00:00.000Z');
    expect(w.current.to).toBe(now);
  });

  it('uses the viewer\'s zone for where days begin', () => {
    const w = analyticsWindow('7d', new Date('2026-09-12T20:00:00Z'), 'Asia/Phnom_Penh');
    expect(w.days.at(-1)).toBe('2026-09-13');
    expect(w.current.from.toISOString()).toBe('2026-09-06T17:00:00.000Z');
  });

  it('compares against an adjacent window of EXACTLY the same length', () => {
    const w = analyticsWindow('7d', now, 'UTC');
    const currentLength = w.current.to.getTime() - w.current.from.getTime();
    const previousLength = w.previous.to.getTime() - w.previous.from.getTime();
    expect(previousLength).toBe(currentLength);
    expect(w.previous.from.toISOString()).toBe('2026-08-30T00:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    const w = analyticsWindow('7d', new Date('2026-01-03T12:00:00Z'), 'UTC');
    expect(w.days[0]).toBe('2025-12-28');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and refuses anything else', () => {
    expect(isValidTimeZone('Asia/Phnom_Penh')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
