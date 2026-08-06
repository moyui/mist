import {
  decodeRealtimeNativeMapMessage,
  parseRealtimeMessage,
  RealtimeNativeMapDecodeError,
} from './realtime-native-map.decoder';

const timestamp = '2026-07-26T10:00:00+08:00';

describe('schema-v2 native-map decoder', () => {
  it('accepts a QMT multi-entry map without parsing provider fields', () => {
    const decoded = decodeRealtimeNativeMapMessage(
      parseRealtimeMessage(
        JSON.stringify(
          message('qmt', {
            '300502.SZ': { arbitrary: { nested: true } },
            '600030.SH': { another: ['provider', 'value'] },
          }),
        ),
      ),
      'qmt',
    );

    expect(decoded.data.native).toEqual({
      '300502.SZ': { arbitrary: { nested: true } },
      '600030.SH': { another: ['provider', 'value'] },
    });
  });

  it('requires a TDX map to contain exactly one entry', () => {
    expect(() =>
      decodeRealtimeNativeMapMessage(
        parseRealtimeMessage(
          JSON.stringify(
            message('tdx', {
              '300502.SZ': {},
              '600030.SH': {},
            }),
          ),
        ),
        'tdx',
      ),
    ).toThrow(
      new RealtimeNativeMapDecodeError(
        'REALTIME_FRAME_NATIVE_CARDINALITY_INVALID',
      ),
    );
  });

  it.each([
    { ...message('qmt', { '300502.SZ': {} }), legacy: true },
    {
      ...message('qmt', { '300502.SZ': {} }),
      data: {
        ...message('qmt', { '300502.SZ': {} }).data,
        sequence: 1,
      },
    },
    message('tdx', { '300502.SZ': {} }),
  ])('rejects legacy, unknown, or wrong-provider envelope %#', (value) => {
    expect(() =>
      decodeRealtimeNativeMapMessage(
        parseRealtimeMessage(JSON.stringify(value)),
        'qmt',
      ),
    ).toThrow(RealtimeNativeMapDecodeError);
  });

  it('rejects an oversized frame before JSON parsing', () => {
    const parseSpy = jest.spyOn(JSON, 'parse');
    try {
      expect(() => parseRealtimeMessage('x'.repeat(1_048_577))).toThrow(
        new RealtimeNativeMapDecodeError('REALTIME_FRAME_BYTES_EXCEEDED'),
      );
      expect(parseSpy).not.toHaveBeenCalled();
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('accepts a Z-suffixed RFC3339 timestamp on the envelope and capturedAt', () => {
    const decoded = decodeRealtimeNativeMapMessage(
      parseRealtimeMessage(
        JSON.stringify(
          message('qmt', { '300502.SZ': {} }, '2026-07-26T02:00:00.000Z'),
        ),
      ),
      'qmt',
    );

    expect(decoded.timestamp).toBe('2026-07-26T02:00:00.000Z');
    expect(decoded.data.capturedAt).toBe('2026-07-26T02:00:00.000Z');
  });

  it.each(['2026-07-26 10:00:00', 'not-a-date', '2026-07-26T10:00:00'])(
    'rejects non-RFC3339 capturedAt %s',
    (bad) => {
      const frame = message('qmt', { '300502.SZ': {} });
      frame.data.capturedAt = bad;
      expect(() =>
        decodeRealtimeNativeMapMessage(
          parseRealtimeMessage(JSON.stringify(frame)),
          'qmt',
        ),
      ).toThrow(
        new RealtimeNativeMapDecodeError('REALTIME_FRAME_DATA_INVALID'),
      );
    },
  );

  it.each([
    ['{', 'REALTIME_FRAME_JSON_INVALID'],
    ['[]', 'REALTIME_FRAME_ENVELOPE_INVALID'],
  ])('rejects invalid outer input %s', (raw, code) => {
    expect(() => parseRealtimeMessage(raw)).toThrow(
      new RealtimeNativeMapDecodeError(code),
    );
  });
});

function message(
  provider: 'tdx' | 'qmt',
  native: Record<string, unknown>,
  ts = timestamp,
) {
  return {
    type: 'realtime.native_snapshot',
    provider,
    timestamp: ts,
    data: {
      schemaVersion: 2,
      capturedAt: ts,
      native,
    },
  };
}
