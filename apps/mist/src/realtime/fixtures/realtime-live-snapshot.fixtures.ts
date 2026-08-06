export interface RealtimeLiveSnapshotFixture {
  readonly evidenceRun: string;
  readonly source: 'tdx' | 'qmt';
  readonly securityId: number;
  readonly providerSymbol: string;
  readonly capturedAt: string;
  readonly expectedEventTime: string;
  readonly expectedCumulativeVolume: string;
  readonly expectedCumulativeAmount: string;
  readonly expectedPrices: {
    readonly last: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly lastClose: number;
  };
  readonly native: Readonly<Record<string, unknown>>;
}

/**
 * Sanitized snapshots captured through the production datasource WebSocket
 * during the 2026-08-04 A-share trading session. The run id is retained so
 * every deterministic replay value can be traced back to its HIL artifact.
 *
 * These fixtures prove decoder/converter/candle behavior only. They are not a
 * substitute for terminal ownership, Redis AOF restart or historical compare
 * HIL gates.
 */
export const REALTIME_LIVE_SNAPSHOT_FIXTURES: readonly RealtimeLiveSnapshotFixture[] =
  [
    {
      evidenceRun: '30885030432',
      source: 'tdx',
      securityId: 9,
      providerSymbol: '600030.SH',
      capturedAt: '2026-08-04T14:44:37+08:00',
      // The converter normalizes the datasource capture instant to strict UTC
      // Z (1421cb5); capturedAt keeps the wire value as provenance.
      expectedEventTime: '2026-08-04T06:44:37.000Z',
      expectedCumulativeVolume: '113980100',
      expectedCumulativeAmount: '3204521600',
      expectedPrices: {
        last: 28,
        open: 28.22,
        high: 28.42,
        low: 27.97,
        lastClose: 28.27,
      },
      native: {
        LastClose: '28.27',
        Open: '28.22',
        Max: '28.42',
        Min: '27.97',
        Now: '28.00',
        Volume: '1139801',
        Amount: '320452.16',
      },
    },
    {
      evidenceRun: '30882148246',
      source: 'qmt',
      securityId: 1,
      providerSymbol: '600519.SH',
      capturedAt: '2026-08-04T13:54:48.576157+08:00',
      expectedEventTime: '2026-08-04T05:54:49.000Z',
      expectedCumulativeVolume: '2820400',
      expectedCumulativeAmount: '3773928400',
      expectedPrices: {
        last: 1332.14,
        open: 1350.06,
        high: 1350.94,
        low: 1330.6000000000001,
        lastClose: 1358.98,
      },
      native: {
        lastPrice: 1332.14,
        open: 1350.06,
        high: 1350.94,
        low: 1330.6000000000001,
        lastClose: 1358.98,
        volume: 28204,
        amount: 3773928400,
        time: 1785822889000,
        stime: '20260804135449.000',
      },
    },
  ];
