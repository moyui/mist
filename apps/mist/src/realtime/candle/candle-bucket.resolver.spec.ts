import { resolveCandleBucket } from './candle-bucket.resolver';

/**
 * Table-driven session/bucket resolution tests.
 *
 * All eventTime inputs are RFC3339 UTC strings; the resolver converts to
 * Asia/Shanghai. Expected bucket start/end are epoch ms.
 */
describe('resolveCandleBucket', () => {
  // Helper: build an ISO string for a Shanghai wall-clock time on a fixed date.
  // Shanghai is UTC+8, so UTC = wall - 8h.
  const sh = (
    y: number,
    mo: number,
    d: number,
    h: number,
    mi: number,
    s = 0,
  ): string => {
    const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
    // Construct as if wall time, then mark +08:00.
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+08:00`;
  };

  const minStart = (iso: string): number => {
    // Truncate to minute in +08:00 by parsing the resolver-equivalent.
    return resolveCandleBucket(iso)!.bucketStartMs;
  };

  it.each([
    {
      name: 'morning open 09:30:30',
      iso: sh(2026, 7, 28, 9, 30, 30),
      session: 'morning',
      tradingDay: '20260728',
    },
    {
      name: 'morning mid 10:15:00',
      iso: sh(2026, 7, 28, 10, 15),
      session: 'morning',
      tradingDay: '20260728',
    },
    {
      name: 'morning last second 11:30:59',
      iso: sh(2026, 7, 28, 11, 30, 59),
      session: 'morning',
      tradingDay: '20260728',
    },
    {
      name: 'afternoon open 13:00:00',
      iso: sh(2026, 7, 28, 13, 0),
      session: 'afternoon',
      tradingDay: '20260728',
    },
    {
      name: 'afternoon close 15:00:00',
      iso: sh(2026, 7, 28, 15, 0),
      session: 'afternoon',
      tradingDay: '20260728',
    },
    {
      name: 'close-delay 15:01:30 (still afternoon)',
      iso: sh(2026, 7, 28, 15, 1, 30),
      session: 'afternoon',
      tradingDay: '20260728',
    },
    {
      name: 'close-delay edge 15:02:00 (still afternoon)',
      iso: sh(2026, 7, 28, 15, 2),
      session: 'afternoon',
      tradingDay: '20260728',
    },
  ])('resolves session for $name', ({ iso, session, tradingDay }) => {
    const result = resolveCandleBucket(iso);
    expect(result).not.toBeNull();
    expect(result!.session).toBe(session);
    expect(result!.tradingDay).toBe(tradingDay);
  });

  it.each([
    { name: 'pre-open 09:29:59', iso: sh(2026, 7, 28, 9, 29, 59) },
    { name: 'lunch start 11:31:00', iso: sh(2026, 7, 28, 11, 31) },
    { name: 'lunch mid 12:30:00', iso: sh(2026, 7, 28, 12, 30) },
    { name: 'lunch end 12:59:59', iso: sh(2026, 7, 28, 12, 59, 59) },
    { name: 'deep post-close 15:03:00', iso: sh(2026, 7, 28, 15, 3) },
    { name: 'midnight 00:00:00', iso: sh(2026, 7, 28, 0, 0) },
  ])('returns null for $name (out of session)', ({ iso }) => {
    expect(resolveCandleBucket(iso)).toBeNull();
  });

  it('aligns bucket start to the minute boundary (seconds truncated)', () => {
    // 09:30:45 → bucket start should be 09:30:00.
    const result = resolveCandleBucket(sh(2026, 7, 28, 9, 30, 45));
    expect(result).not.toBeNull();
    // bucketStart is 09:30:00+08:00 = 01:30:00Z
    expect(new Date(result!.bucketStartMs).toISOString()).toBe(
      '2026-07-28T01:30:00.000Z',
    );
    expect(result!.bucketEndMs - result!.bucketStartMs).toBe(60_000);
  });

  it('produces distinct buckets for consecutive minutes', () => {
    const b1 = resolveCandleBucket(sh(2026, 7, 28, 9, 30));
    const b2 = resolveCandleBucket(sh(2026, 7, 28, 9, 31));
    expect(b2!.bucketStartMs).toBe(b1!.bucketStartMs + 60_000);
  });

  it('keeps the same bucket across the full minute (09:30:00–09:30:59)', () => {
    const start = minStart(sh(2026, 7, 28, 9, 30, 0));
    const mid = minStart(sh(2026, 7, 28, 9, 30, 30));
    const end = minStart(sh(2026, 7, 28, 9, 30, 59));
    expect(mid).toBe(start);
    expect(end).toBe(start);
  });

  it('rolls tradingDay across a session boundary date', () => {
    const d1 = resolveCandleBucket(sh(2026, 7, 28, 14, 59));
    const d2 = resolveCandleBucket(sh(2026, 7, 29, 9, 31));
    expect(d1!.tradingDay).toBe('20260728');
    expect(d2!.tradingDay).toBe('20260729');
  });

  it('returns null for an unparseable eventTime', () => {
    expect(resolveCandleBucket('not-a-date')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(resolveCandleBucket('')).toBeNull();
  });
});
