import {
  decodeRealtimeNativeMapMessage,
  RealtimeNativeMapDecodeError,
} from './realtime-native-map-frame';

const timestamp = '2026-07-26T10:00:00+08:00';

describe('schema-v2 native-map decoder', () => {
  it('accepts a QMT multi-entry map without parsing provider fields', () => {
    const decoded = decodeRealtimeNativeMapMessage(
      JSON.stringify(
        message('qmt', {
          '300502.SZ': { arbitrary: { nested: true } },
          '600030.SH': { another: ['provider', 'value'] },
        }),
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
        JSON.stringify(
          message('tdx', {
            '300502.SZ': {},
            '600030.SH': {},
          }),
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
      decodeRealtimeNativeMapMessage(JSON.stringify(value), 'qmt'),
    ).toThrow(RealtimeNativeMapDecodeError);
  });
});

function message(provider: 'tdx' | 'qmt', native: Record<string, unknown>) {
  return {
    type: 'realtime.native_snapshot',
    provider,
    timestamp,
    data: {
      schemaVersion: 2,
      capturedAt: timestamp,
      native,
    },
  };
}
