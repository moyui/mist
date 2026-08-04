import { DataSource } from '@app/shared-data';
import {
  closedCandleKey,
  dueKey,
  manifestKey,
  watermarkKey,
} from '@app/realtime';
import { RealtimeStrategyStartupCompensationService } from './realtime-strategy-startup-compensation.service';

describe('RealtimeStrategyStartupCompensationService', () => {
  it('submits manifest-reachable current-day terminals once in stable order', async () => {
    const day = '20260804';
    const hashes = new Map<string, Record<string, string>>();
    seedSealed(hashes, day, 'qmt', 2, 1_785_825_840_000, 20);
    seedDiscarded(hashes, day, 'tdx', 1, 1_785_825_780_000);
    seedSealed(hashes, day, 'tdx', 3, 1_785_825_840_000, 30);
    const handoff = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new RealtimeStrategyStartupCompensationService(
      {
        client: { hgetall: (key: string) => hashes.get(key) ?? {} },
        isAvailable: () => true,
      } as never,
      {
        list: (source: DataSource) =>
          source === DataSource.TDX
            ? [
                { securityId: 3, formatCode: '3' },
                { securityId: 1, formatCode: '1' },
              ]
            : [{ securityId: 2, formatCode: '2' }],
      } as never,
      { nowDate: () => new Date('2026-08-04T07:00:00.000Z') } as never,
      handoff,
    );

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(handoff.publish.mock.calls.map(([trigger]) => trigger)).toEqual([
      expect.objectContaining({
        source: 'tdx',
        securityId: 1,
        outcome: 'discarded',
      }),
      expect.objectContaining({ source: 'qmt', securityId: 2 }),
      expect.objectContaining({ source: 'tdx', securityId: 3 }),
    ]);
    expect(service.snapshot()).toEqual({ outcome: 'completed', submitted: 3 });
  });

  it('stops the single pass after the first enqueue failure', async () => {
    const hashes = new Map<string, Record<string, string>>();
    seedSealed(hashes, '20260804', 'tdx', 1, 1_785_825_780_000, 10);
    seedSealed(hashes, '20260804', 'tdx', 2, 1_785_825_840_000, 20);
    const handoff = { publish: jest.fn().mockRejectedValue(new Error('down')) };
    const service = new RealtimeStrategyStartupCompensationService(
      {
        client: { hgetall: (key: string) => hashes.get(key) ?? {} },
        isAvailable: () => true,
      } as never,
      {
        list: () => [
          { securityId: 1, formatCode: '1' },
          { securityId: 2, formatCode: '2' },
        ],
      } as never,
      { nowDate: () => new Date('2026-08-04T07:00:00.000Z') } as never,
      handoff,
    );

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(handoff.publish).toHaveBeenCalledTimes(1);
    expect(service.snapshot()).toEqual({ outcome: 'failed', submitted: 0 });
  });

  it('does not scan market Redis when the handoff module is absent', async () => {
    const hgetall = jest.fn();
    const service = new RealtimeStrategyStartupCompensationService(
      { client: { hgetall }, isAvailable: () => true } as never,
      { list: jest.fn() } as never,
      { nowDate: jest.fn() } as never,
      undefined,
    );

    await service.onApplicationBootstrap();

    expect(hgetall).not.toHaveBeenCalled();
    expect(service.snapshot()).toEqual({
      outcome: 'not_enabled',
      submitted: 0,
    });
  });
});

function seedSealed(
  hashes: Map<string, Record<string, string>>,
  day: string,
  source: 'tdx' | 'qmt',
  securityId: number,
  timestampMs: number,
  close: number,
): void {
  const closed = closedCandleKey(day, source, securityId);
  const watermark = watermarkKey(day, source, securityId);
  hashes.set(manifestKey(day, source, securityId), {
    closed,
    watermark,
    due: dueKey(day),
  });
  hashes.set(closed, {
    [timestampMs]: JSON.stringify({
      o: close,
      h: close,
      l: close,
      c: close,
      v: null,
      a: null,
      cv: null,
      ca: null,
      cs: null,
      fe: new Date(timestampMs).toISOString(),
      le: new Date(timestampMs + 59_000).toISOString(),
      q: 'provisional',
    }),
  });
  hashes.set(watermark, {
    sealedThroughBucket: String(timestampMs),
    outcome: 'closed',
  });
}

function seedDiscarded(
  hashes: Map<string, Record<string, string>>,
  day: string,
  source: 'tdx' | 'qmt',
  securityId: number,
  timestampMs: number,
): void {
  const watermark = watermarkKey(day, source, securityId);
  hashes.set(manifestKey(day, source, securityId), {
    watermark,
    due: dueKey(day),
  });
  hashes.set(watermark, {
    sealedThroughBucket: String(timestampMs),
    outcome: 'discarded',
    invalidReason: 'no_snapshot',
  });
}
