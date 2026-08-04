import {
  decodeBacktestResultCursor,
  encodeBacktestResultCursor,
} from './backtest-result-cursor';

describe('backtest result cursor', () => {
  const cursor = {
    runId: 4,
    signalTime: new Date('2026-08-04T01:30:00.000Z'),
    id: 17,
  };

  it('round-trips an opaque unpadded base64url token', () => {
    const encoded = encodeBacktestResultCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
    expect(decodeBacktestResultCursor(encoded, 4)).toEqual(cursor);
  });

  it.each([
    '',
    'eA==',
    'not base64',
    Buffer.from(
      JSON.stringify({
        v: 1,
        runId: 5,
        signalTime: cursor.signalTime.toISOString(),
        id: 17,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        v: 1,
        runId: 4,
        signalTime: '2026-08-04T01:30:00Z',
        id: 17,
      }),
    ).toString('base64url'),
  ])('rejects malformed or cross-run cursor', (value) => {
    expect(() => decodeBacktestResultCursor(value, 4)).toThrow();
  });
});
