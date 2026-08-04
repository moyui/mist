import { ConfigService } from '@nestjs/config';
import { compileStoredStrategyRule, type StrategyBar } from '@app/strategy';
import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import { QmtRealtimeClient } from '../../../mist/src/sources/qmt/realtime/realtime.client';
import { QmtRealtimeStore } from '../../../mist/src/sources/qmt/realtime/realtime.store';
import { TdxRealtimeClient } from '../../../mist/src/sources/tdx/realtime/realtime.client';
import { TdxRealtimeStore } from '../../../mist/src/sources/tdx/realtime/realtime.store';
import {
  REALTIME_LIVE_SNAPSHOT_FIXTURES,
  type RealtimeLiveSnapshotFixture,
} from '../../../mist/src/realtime/fixtures/realtime-live-snapshot.fixtures';
import { RealtimeSnapshotIngressService } from '../../../mist/src/realtime/realtime-snapshot-ingress.service';
import type { CanonicalRealtimeSnapshot } from '../../../mist/src/realtime/realtime.types';
import { resolveCandleBucket } from '../../../mist/src/realtime/candle/candle-bucket.util';
import { CandleFinalizer } from '../../../mist/src/realtime/candle/candle-finalizer';
import { OpenCandleAggregator } from '../../../mist/src/realtime/candle/open-candle-aggregator';
import { RealtimeMarketDataProductService } from '../../../mist/src/realtime/candle/realtime-market-data-product.service';
import { BullMqCandleFinalizationHandoffService } from '../../../mist/src/realtime/strategy-trigger/bullmq-candle-finalization-handoff.service';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';

interface RecordedCommand {
  readonly command: string;
  readonly arguments: unknown[];
}

describe.each(REALTIME_LIVE_SNAPSHOT_FIXTURES)(
  '$source captured snapshot shadow vertical replay',
  (fixture) => {
    it('runs snapshot -> sealed commit -> post-commit job -> window/evaluator -> shadow candidate', async () => {
      const aggregator = new OpenCandleAggregator();
      const ingress = new RealtimeSnapshotIngressService({
        handleSnapshot(snapshot: CanonicalRealtimeSnapshot) {
          aggregator.applySnapshot(snapshot);
        },
      } as never);
      const client = makeClient(fixture, ingress);
      emit(client, readyFrame(fixture));
      emit(client, snapshotFrame(fixture));

      const bucket = resolveCandleBucket(fixture.expectedEventTime);
      expect(bucket).not.toBeNull();
      const redis = makeFakeRedis();
      const bullQueue = { add: jest.fn().mockResolvedValue(undefined) };
      const product = new RealtimeMarketDataProductService(
        new ConfigService({ REALTIME_PRODUCTIZATION_MODE: 'shadow' }),
        { now: () => bucket!.bucketEndMs } as never,
        { isAvailable: () => true } as never,
        aggregator,
        new CandleFinalizer(),
        { list: () => [] } as never,
        new BullMqCandleFinalizationHandoffService(bullQueue as never),
      );

      await processDue(
        product,
        redis,
        bucket!.tradingDay,
        fixture.securityId,
        fixture.source,
        bucket!.bucketStartMs,
        bucket!.bucketEndMs,
      );
      await Promise.resolve();

      expect(bullQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload] = bullQueue.add.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(jobName).toBe(CANDLE_FINALIZED_JOB_NAME);
      const bar = closedRecordToBar(
        redis.commands,
        fixture,
        bucket!.bucketStartMs,
      );
      const marketData = {
        loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
        resolveRealtimeObservation: jest
          .fn()
          .mockResolvedValue({ outcome: 'sealed', bar }),
      };
      const processor = new CandleFinalizedJobProcessor(
        marketData,
        () => [
          {
            definitionId: 101,
            versionId: 201,
            source: fixture.source,
            period: 1,
            ruleSnapshot: {
              field: 'k.close',
              operator: 'gt',
              value: fixture.expectedPrices.last - 0.01,
            },
            plan: compileStoredStrategyRule(
              {
                field: 'k.close',
                operator: 'gt',
                value: fixture.expectedPrices.last - 0.01,
              },
              'entry',
            ),
          },
        ],
        () => new Date(fixture.expectedEventTime),
      );

      const result = await processor.process(jobName, payload);

      expect(result.outcome).toBe('completed');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({
        securityId: fixture.securityId,
        source: fixture.source,
        period: 1,
        signalKind: 'entry',
        signalTime: new Date(bucket!.bucketStartMs),
        triggerTime: new Date(bucket!.bucketStartMs).toISOString(),
        triggerPrice: fixture.expectedPrices.last,
        barType: 'complete',
      });
      expect(marketData.loadRealtimeWindow).toHaveBeenCalledTimes(1);
    });
  },
);

async function processDue(
  product: RealtimeMarketDataProductService,
  redis: ReturnType<typeof makeFakeRedis>,
  tradingDay: string,
  securityId: number,
  source: 'tdx' | 'qmt',
  bucketStartMs: number,
  now: number,
): Promise<void> {
  const member = `${securityId}:${source}:${bucketStartMs}`;
  const process = (
    product as unknown as {
      processDueMember(
        client: unknown,
        day: string,
        dueMember: string,
        decoded: {
          securityId: number;
          source: 'tdx' | 'qmt';
          bucketStartMs: number;
        },
        nowMs: number,
      ): Promise<void>;
    }
  ).processDueMember.bind(product);
  await process(
    redis as never,
    tradingDay,
    member,
    { securityId, source, bucketStartMs },
    now,
  );
}

function closedRecordToBar(
  commands: readonly RecordedCommand[],
  fixture: RealtimeLiveSnapshotFixture,
  bucketStartMs: number,
): StrategyBar {
  const write = commands.find(
    ({ command, arguments: args }) =>
      command === 'hset' && args[1] === String(bucketStartMs),
  );
  if (!write || typeof write.arguments[2] !== 'string') {
    throw new Error('sealed Redis record was not written');
  }
  const record = JSON.parse(write.arguments[2]) as Record<string, unknown>;
  return {
    securityId: fixture.securityId,
    source: fixture.source,
    period: 1,
    timestamp: new Date(bucketStartMs),
    open: requireNumber(record.o),
    high: requireNumber(record.h),
    low: requireNumber(record.l),
    close: requireNumber(record.c),
    volume: requireQuantity(record.v),
    amount: requireQuantity(record.a),
    type: 'complete',
  };
}

function requireNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('sealed OHLC must be finite');
  }
  return value;
}

function requireQuantity(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new TypeError('sealed quantity must be string or null');
}

function makeFakeRedis() {
  const commands: RecordedCommand[] = [];
  const chain: Record<string, jest.Mock> = {};
  for (const command of ['hset', 'hdel', 'zrem', 'expireat']) {
    chain[command] = jest.fn((...arguments_: unknown[]) => {
      commands.push({ command, arguments: arguments_ });
      return chain;
    });
  }
  chain.exec = jest.fn(async () => []);
  return {
    commands,
    hgetall: jest.fn().mockResolvedValue({}),
    zrem: jest.fn().mockResolvedValue(1),
    multi: jest.fn(() => chain),
  };
}

function makeClient(
  fixture: RealtimeLiveSnapshotFixture,
  ingress: RealtimeSnapshotIngressService,
): TdxRealtimeClient | QmtRealtimeClient {
  const resolve = (candidate: string) =>
    candidate === fixture.providerSymbol
      ? {
          formatCode: fixture.providerSymbol,
          securityId: fixture.securityId,
        }
      : null;
  const allowlist = {
    resolve,
    resolveEffective: resolve,
    entriesList: [
      {
        formatCode: fixture.providerSymbol,
        securityId: fixture.securityId,
      },
    ],
  };
  return fixture.source === 'tdx'
    ? new TdxRealtimeClient(
        new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
        new TdxRealtimeStore(),
        allowlist as never,
        undefined,
        ingress,
      )
    : new QmtRealtimeClient(
        new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
        new QmtRealtimeStore(),
        allowlist as never,
        Date.now,
        ingress,
      );
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
        ? { leaderClientId: 'offline-shadow-replay', active: [] }
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

function emit(client: object, message: Record<string, unknown>): void {
  (client as { handleMessage(raw: string): void }).handleMessage(
    JSON.stringify(message),
  );
}
