import { ConfigService } from '@nestjs/config';
import { QmtRealtimeClient } from '../../sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../../sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../../sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../../sources/tdx/realtime/realtime.store';
import {
  REALTIME_LIVE_SNAPSHOT_FIXTURES,
  RealtimeLiveSnapshotFixture,
} from '../fixtures/realtime-live-snapshot.fixtures';
import { RealtimeSnapshotIngressService } from '../realtime-snapshot-ingress.service';
import type { CanonicalRealtimeSnapshot } from '../realtime.types';
import { closedCandleKey } from '../realtime-redis.constants';
import { resolveCandleBucket } from './candle-bucket.util';
import { CandleFinalizer } from './candle-finalizer';
import type { ApplySnapshotOutcome } from './candle.types';
import { OpenCandleAggregator } from './open-candle-aggregator';

interface RecordedCommand {
  cmd: string;
  args: unknown[];
}

describe.each(REALTIME_LIVE_SNAPSHOT_FIXTURES)(
  '$source production snapshot replay (run $evidenceRun)',
  (fixture) => {
    it('replays wire -> decoder -> canonical -> candle -> sealed Redis record', async () => {
      const aggregator = new OpenCandleAggregator();
      const snapshots: CanonicalRealtimeSnapshot[] = [];
      const outcomes: ApplySnapshotOutcome[] = [];
      const product = {
        handleSnapshot(snapshot: CanonicalRealtimeSnapshot) {
          snapshots.push(snapshot);
          outcomes.push(aggregator.applySnapshot(snapshot));
        },
      };
      const ingress = new RealtimeSnapshotIngressService(product as never);
      const client = makeClient(fixture, ingress);

      emit(client, readyFrame(fixture));
      emit(client, snapshotFrame(fixture));
      // A duplicated datasource frame must not mutate the candle twice.
      emit(client, snapshotFrame(fixture));

      expect(snapshots).toHaveLength(2);
      const snapshot = snapshots[0];
      expect(snapshot).toMatchObject({
        source: fixture.source,
        securityId: fixture.securityId,
        providerSymbol: fixture.providerSymbol,
        capturedAt: fixture.capturedAt,
        eventTime: fixture.expectedEventTime,
        prices: fixture.expectedPrices,
        cumulativeVolume: fixture.expectedCumulativeVolume,
        cumulativeAmount: fixture.expectedCumulativeAmount,
        quality: {
          level: 'latest-state',
          eventTimeAvailable: true,
          aggregationEligible: true,
          partialPrices: false,
        },
        native: fixture.native,
      });
      expect(ingress.readSeries(fixture.securityId, fixture.source)).toEqual(
        snapshot,
      );

      const bucket = resolveCandleBucket(fixture.expectedEventTime);
      expect(bucket).not.toBeNull();
      expect(outcomes).toEqual([
        { kind: 'opened', bucket },
        { kind: 'skipped', reason: 'duplicate_or_late' },
      ]);

      const candidate = aggregator.peekCandidate(
        fixture.securityId,
        fixture.source,
        bucket!.bucketStartMs,
      );
      expect(candidate).toMatchObject({
        source: fixture.source,
        securityId: fixture.securityId,
        providerSymbol: fixture.providerSymbol,
        bucketStartMs: bucket!.bucketStartMs,
        bucketEndMs: bucket!.bucketEndMs,
        open: fixture.expectedPrices.last,
        high: fixture.expectedPrices.last,
        low: fixture.expectedPrices.last,
        close: fixture.expectedPrices.last,
        volumeDelta: null,
        amountDelta: null,
        baselineCumulativeVolume: null,
        baselineCumulativeAmount: null,
        lastCumulativeVolume: fixture.expectedCumulativeVolume,
        lastCumulativeAmount: fixture.expectedCumulativeAmount,
        validity: 'valid',
      });

      const candle = aggregator.freezeCandidate(
        fixture.securityId,
        fixture.source,
        bucket!.bucketStartMs,
      );
      expect(candle).toMatchObject({
        volume: null,
        amount: null,
        closingCumulativeVolume: fixture.expectedCumulativeVolume,
        closingCumulativeAmount: fixture.expectedCumulativeAmount,
        closingSnapshot: {
          eventTime: fixture.expectedEventTime,
          capturedAt: fixture.capturedAt,
          cumulativeVolume: fixture.expectedCumulativeVolume,
          cumulativeAmount: fixture.expectedCumulativeAmount,
        },
        quality: 'provisional',
      });

      const fakeRedis = makeFakeRedis();
      expect(
        await new CandleFinalizer().seal(
          fakeRedis as never,
          candle!,
          bucket!.bucketEndMs,
        ),
      ).toBe(true);

      const closedWrite = fakeRedis.commands.find(
        (command) =>
          command.cmd === 'hset' &&
          command.args[0] ===
            closedCandleKey(
              bucket!.tradingDay,
              fixture.source,
              fixture.securityId,
            ),
      );
      expect(closedWrite).toBeDefined();
      expect(closedWrite!.args[1]).toBe(String(bucket!.bucketStartMs));
      expect(JSON.parse(closedWrite!.args[2] as string)).toMatchObject({
        o: fixture.expectedPrices.last,
        h: fixture.expectedPrices.last,
        l: fixture.expectedPrices.last,
        c: fixture.expectedPrices.last,
        v: null,
        a: null,
        cv: fixture.expectedCumulativeVolume,
        ca: fixture.expectedCumulativeAmount,
        fe: fixture.expectedEventTime,
        le: fixture.expectedEventTime,
        q: 'provisional',
      });
    });
  },
);

function makeClient(
  fixture: RealtimeLiveSnapshotFixture,
  ingress: RealtimeSnapshotIngressService,
): TdxRealtimeClient | QmtRealtimeClient {
  const allowlist = resolver(fixture.providerSymbol, fixture.securityId);
  if (fixture.source === 'tdx') {
    return new TdxRealtimeClient(
      new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
      new TdxRealtimeStore(),
      allowlist as never,
      undefined,
      ingress,
    );
  }
  return new QmtRealtimeClient(
    new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
    new QmtRealtimeStore(),
    allowlist as never,
    Date.now,
    ingress,
  );
}

function resolver(providerSymbol: string, securityId: number) {
  const resolve = (candidate: string) =>
    candidate === providerSymbol
      ? { formatCode: providerSymbol, securityId }
      : null;
  return {
    resolve,
    resolveEffective: resolve,
    entriesList: [{ formatCode: providerSymbol, securityId }],
  };
}

function readyFrame(fixture: RealtimeLiveSnapshotFixture) {
  return {
    type: 'realtime.ready',
    provider: fixture.source,
    timestamp: fixture.capturedAt,
    data: {
      mode: 'builtin',
      schemaVersion: 2,
      source: fixture.source.toUpperCase(),
      quality: 'latest-state',
      ...(fixture.source === 'qmt'
        ? { leaderClientId: 'offline-live-sample-replay', active: [] }
        : {}),
    },
  };
}

function snapshotFrame(fixture: RealtimeLiveSnapshotFixture) {
  return {
    type: 'realtime.native_snapshot',
    provider: fixture.source,
    timestamp: fixture.capturedAt,
    data: {
      schemaVersion: 2,
      capturedAt: fixture.capturedAt,
      native: { [fixture.providerSymbol]: fixture.native },
    },
  };
}

function emit(client: object, message: Record<string, unknown>) {
  (client as { handleMessage(raw: string): void }).handleMessage(
    JSON.stringify(message),
  );
}

function makeFakeRedis() {
  const commands: RecordedCommand[] = [];
  const chain: Record<string, jest.Mock> = {};
  for (const command of ['hset', 'hdel', 'zrem', 'expireat']) {
    chain[command] = jest.fn((...args: unknown[]) => {
      commands.push({ cmd: command, args });
      return chain;
    });
  }
  chain.exec = jest.fn(async () => []);
  return {
    commands,
    multi: jest.fn(() => chain),
  };
}
