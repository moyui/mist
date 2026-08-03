import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REALTIME_CANDLE_GRACE_LIMITS,
  REALTIME_CANDLE_QUEUE_LIMITS,
} from '@app/config';
import { DataSource } from '@app/shared-data';
import { toZonedTime } from 'date-fns-tz';
import type Redis from 'ioredis';
import { Clock } from '../clock.service';
import { RealtimeRedisService } from '../realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';
import type { CanonicalRealtimeSnapshot } from '../realtime.types';
import type { RealtimeSource } from '../realtime.types';
import { OpenCandleAggregator } from './open-candle-aggregator';
import { CandleFinalizer } from './candle-finalizer';
import { KeyedQueue } from './keyed-queue';
import { resolveCandleBucket } from './candle-bucket.util';
import type { CandleBucket } from './candle.types';
import { marketSeriesKey } from './market-series-key';
import {
  dueKey,
  encodeDueMember,
  decodeDueMember,
  manifestKey,
  closedCandleKey,
  watermarkKey,
  RETENTION_AFTER_DAY_END_HOURS,
  REALTIME_REDIS_RANGE_BATCH_SIZE,
  REALTIME_REDIS_RECORD_LIMITS,
  assertRealtimeRedisBytes,
} from '../realtime-redis.constants';

/** Due scanner interval. Design: "每秒扫描". */
const DUE_SCAN_INTERVAL_MS = 1_000;
const FINALIZATION_HARD_HORIZON_MS = 60_000;

interface ExpectedSeriesState {
  securityId: number;
  source: RealtimeSource;
  providerSymbol: string;
  eligibleFromBucketStartMs: number;
  lastRegisteredBucketStartMs: number | null;
}

/**
 * Product-layer orchestrator for the current-day realtime candle product (B1).
 *
 * Wires together the candle state machine ({@link OpenCandleAggregator}), the
 * Redis sealer ({@link CandleFinalizer}), the per-market-series {@link KeyedQueue},
 * and a due-scanner that finalizes buckets after their grace window.
 *
 * When `REALTIME_PRODUCTIZATION_MODE=off` (default), every method is a no-op —
 * the transport memory latest stays the only product surface, identical to the
 * pre-B1 behavior. `shadow`/`on` activate Redis writes.
 */
@Injectable()
export class RealtimeMarketDataProductService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeMarketDataProductService.name);
  private readonly mode: string;
  private readonly graceMs: number;
  private readonly queue: KeyedQueue;
  private readonly expectedSeries = new Map<string, ExpectedSeriesState>();
  private readonly registeredDueMembers = new Set<string>();
  private readonly expectedDueMembers = new Set<string>();
  private readonly dueInFlight = new Set<string>();
  private scannerTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
    private readonly redis: RealtimeRedisService,
    private readonly aggregator: OpenCandleAggregator,
    private readonly finalizer: CandleFinalizer,
    private readonly allowlist: RealtimeSecurityAllowlistService,
  ) {
    const rawMode =
      this.config.get<string>('REALTIME_PRODUCTIZATION_MODE') ?? 'off';
    // A7 (design 437): invalid mode fails fast (defense-in-depth beyond Joi).
    if (rawMode !== 'off' && rawMode !== 'shadow' && rawMode !== 'on') {
      throw new Error(
        `Invalid REALTIME_PRODUCTIZATION_MODE=${JSON.stringify(rawMode)}; expected off, shadow, or on`,
      );
    }
    this.mode = rawMode;
    this.graceMs =
      this.config.get<number>('REALTIME_CANDLE_GRACE_MS') ??
      REALTIME_CANDLE_GRACE_LIMITS.default;
    this.queue = new KeyedQueue({
      maxPendingPerSeries:
        this.config.get<number>(
          'REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES',
        ) ?? REALTIME_CANDLE_QUEUE_LIMITS.perSeries.default,
      maxPendingGlobal:
        this.config.get<number>('REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL') ??
        REALTIME_CANDLE_QUEUE_LIMITS.global.default,
    });
  }

  onModuleInit(): void {
    if (this.mode === 'off' || !this.redis.isAvailable()) return;
    void this.scanDue();
    this.scannerTimer = setInterval(
      () => void this.scanDue(),
      DUE_SCAN_INTERVAL_MS,
    );
    this.scannerTimer.unref?.();
    this.logger.log(
      `Due scanner started (mode=${this.mode}, grace=${this.graceMs}ms).`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.scannerTimer) {
      clearInterval(this.scannerTimer);
      this.scannerTimer = null;
    }
    this.queue.stopAccepting();
    await this.queue.drain();
  }

  /**
   * Entry point from {@link RealtimeSnapshotIngressService.handleSnapshot}.
   * Records `acceptedAt` synchronously (design line 245), then submits the
   * snapshot to the per-market-series queue for ordered aggregation + Redis writes.
   */
  handleSnapshot(snapshot: CanonicalRealtimeSnapshot): void {
    if (this.stopping || this.mode === 'off' || !this.redis.isAvailable())
      return;

    const acceptedAt = this.clock.now();
    const key = marketSeriesKey(snapshot.securityId, snapshot.source);

    const accepted = this.queue.enqueue(key, () =>
      this.processSnapshot(snapshot, acceptedAt),
    );
    if (!accepted) {
      this.logger.warn(
        `Queue overflow for ${key}; marking candle queue_overflow.`,
      );
      const bucket = snapshot.eventTime
        ? resolveCandleBucket(snapshot.eventTime)
        : null;
      this.aggregator.markInvalid(
        snapshot.securityId,
        snapshot.source,
        'queue_overflow',
        bucket?.bucketStartMs,
      );
    }
  }

  // ---- snapshot processing (inside keyed queue) --------------------------

  private async processSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
    acceptedAt: number,
  ): Promise<void> {
    const client = this.redis.client;
    if (!client) return;

    const outcome = this.aggregator.applySnapshot(snapshot, {
      acceptedAtMs: acceptedAt,
      graceMs: this.graceMs,
    });

    switch (outcome.kind) {
      case 'skipped':
        return;

      case 'opened':
        await this.registerDueIfFirst(
          client,
          outcome.bucket,
          {
            securityId: snapshot.securityId,
            source: snapshot.source,
            providerSymbol: snapshot.providerSymbol,
          },
          acceptedAt,
          false,
        );
        return;

      case 'updated':
        // Normally this is a local no-op. If the first registration failed,
        // the next accepted frame retries it instead of leaving an orphaned
        // invalid candidate with no due identity.
        await this.registerDueIfFirst(
          client,
          outcome.bucket,
          {
            securityId: snapshot.securityId,
            source: snapshot.source,
            providerSymbol: snapshot.providerSymbol,
          },
          acceptedAt,
          false,
        );
        return;

      case 'rolled-over':
        await this.registerDueIfFirst(
          client,
          outcome.opened,
          {
            securityId: snapshot.securityId,
            source: snapshot.source,
            providerSymbol: snapshot.providerSymbol,
          },
          acceptedAt,
          false,
        );
        return;

      case 'invalidated':
        // A first snapshot can open an already-invalid candidate (for example,
        // a counter reset against a recovered baseline), so registration must
        // be idempotent here rather than assuming an earlier `opened` outcome.
        await this.registerDueIfFirst(
          client,
          outcome.bucket,
          {
            securityId: snapshot.securityId,
            source: snapshot.source,
            providerSymbol: snapshot.providerSymbol,
          },
          acceptedAt,
          false,
        );
        return;
    }
  }

  /**
   * On first observation of a new bucket, register it in the due ZSET so the
   * scanner will finalize it after grace. Design line 185: "每个 bucket 首次
   * 建立时只登记一次 due/manifest/TTL".
   */
  private async registerDueIfFirst(
    client: Redis,
    bucket: CandleBucket,
    identity: {
      securityId: number;
      source: RealtimeSource;
      providerSymbol: string;
    },
    acceptedAt: number,
    expected: boolean,
  ): Promise<boolean> {
    if (acceptedAt > bucket.bucketEndMs + this.graceMs) {
      return false;
    }

    try {
      const dueScore = bucket.bucketEndMs + this.graceMs;
      const member = encodeDueMember(
        identity.securityId,
        identity.source,
        identity.providerSymbol,
        bucket.bucketStartMs,
      );
      if (this.registeredDueMembers.has(member)) {
        if (expected) this.expectedDueMembers.add(member);
        return true;
      }

      const manifestK = manifestKey(
        bucket.tradingDay,
        identity.source,
        identity.providerSymbol,
      );
      const manifest = {
        closed: closedCandleKey(
          bucket.tradingDay,
          identity.source,
          identity.providerSymbol,
        ),
      };

      assertRealtimeRedisBytes(
        'candle manifest record',
        JSON.stringify(manifest),
        REALTIME_REDIS_RECORD_LIMITS.manifest,
      );
      const multi = client.multi();
      multi.zadd(dueKey(bucket.tradingDay), dueScore, member);
      multi.hset(manifestK, manifest);
      multi.expire(
        manifestK,
        Math.max(
          Math.ceil(
            (bucket.bucketEndMs +
              RETENTION_AFTER_DAY_END_HOURS * 3600_000 -
              acceptedAt) /
              1000,
          ),
          1,
        ),
      );
      if ((await multi.exec()) === null) {
        throw new Error('due registration transaction returned null');
      }
      this.registeredDueMembers.add(member);
      if (expected) this.expectedDueMembers.add(member);
      return true;
    } catch (error) {
      // A6 (design 303-304): mark candle redis_due_registration_failed.
      this.logger.error(
        `Due registration failed for securityId=${identity.securityId} source=${identity.source} bucket ${bucket.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (!expected) {
        this.aggregator.markInvalid(
          identity.securityId,
          identity.source,
          'redis_due_registration_failed',
          bucket.bucketStartMs,
        );
      }
      return false;
    }
  }

  // ---- due scanner --------------------------------------------------------

  private async scanDue(): Promise<void> {
    if (this.stopping) return;
    const client = this.redis.client;
    if (!client) return;

    const now = this.clock.now();
    await this.syncExpectedBuckets(client, now);
    const tradingDay = this.currentTradingDay(now);
    if (!tradingDay) return;

    let members: string[];
    try {
      members = await client.zrangebyscore(
        dueKey(tradingDay),
        0,
        now,
        'LIMIT',
        0,
        REALTIME_REDIS_RANGE_BATCH_SIZE,
      );
    } catch (error) {
      this.logger.error(
        `Due scan failed for ${tradingDay}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    for (const member of members) {
      if (this.dueInFlight.has(member)) continue;
      let decoded: ReturnType<typeof decodeDueMember>;
      try {
        decoded = decodeDueMember(member);
      } catch (error) {
        this.logger.error(
          `Rejected malformed due member: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      const queueKey = marketSeriesKey(decoded.securityId, decoded.source);
      this.dueInFlight.add(member);
      const accepted = this.queue.enqueue(queueKey, async () => {
        try {
          await this.processDueMember(client, tradingDay, member, decoded, now);
        } finally {
          this.dueInFlight.delete(member);
        }
      });
      if (!accepted) {
        this.dueInFlight.delete(member);
        this.logger.warn(
          `Due queue admission overflow for securityId=${decoded.securityId} source=${decoded.source}; due remains pending.`,
        );
      }
    }
  }

  private async syncExpectedBuckets(client: Redis, now: number): Promise<void> {
    const observed = new Map<
      string,
      { securityId: number; source: RealtimeSource; providerSymbol: string }
    >();
    for (const [source, entries] of [
      ['tdx', this.allowlist.list(DataSource.TDX)],
      ['qmt', this.allowlist.list(DataSource.QMT)],
    ] as const) {
      for (const entry of entries) {
        const identity = {
          securityId: entry.securityId,
          source,
          providerSymbol: entry.formatCode,
        };
        observed.set(marketSeriesKey(identity.securityId, source), identity);
      }
    }

    for (const key of this.expectedSeries.keys()) {
      if (!observed.has(key)) this.expectedSeries.delete(key);
    }

    for (const [key, identity] of observed) {
      const existing = this.expectedSeries.get(key);
      if (!existing || existing.providerSymbol !== identity.providerSymbol) {
        const eligibleFromBucketStartMs = this.nextCompleteBucketStartMs(now);
        if (eligibleFromBucketStartMs === null) continue;
        this.expectedSeries.set(key, {
          ...identity,
          eligibleFromBucketStartMs,
          lastRegisteredBucketStartMs: null,
        });
      }
    }

    const bucket = resolveCandleBucket(new Date(now).toISOString());
    if (!bucket) return;
    for (const state of this.expectedSeries.values()) {
      if (
        state.eligibleFromBucketStartMs > bucket.bucketStartMs ||
        state.lastRegisteredBucketStartMs === bucket.bucketStartMs
      ) {
        continue;
      }
      const registered = await this.registerDueIfFirst(
        client,
        bucket,
        state,
        now,
        true,
      );
      if (registered) {
        state.lastRegisteredBucketStartMs = bucket.bucketStartMs;
      }
    }
  }

  private nextCompleteBucketStartMs(now: number): number | null {
    const current = resolveCandleBucket(new Date(now).toISOString());
    let candidate = current
      ? current.bucketStartMs === now
        ? current.bucketStartMs
        : current.bucketStartMs + 60_000
      : Math.ceil(now / 60_000) * 60_000;
    for (let index = 0; index <= 24 * 60; index++, candidate += 60_000) {
      const bucket = resolveCandleBucket(new Date(candidate).toISOString());
      if (bucket?.bucketStartMs === candidate) return candidate;
    }
    return null;
  }

  private async processDueMember(
    client: Redis,
    tradingDay: string,
    member: string,
    decoded: ReturnType<typeof decodeDueMember>,
    now: number,
  ): Promise<void> {
    if (await this.isAlreadySealed(client, tradingDay, decoded)) {
      await client.zrem(dueKey(tradingDay), member);
      this.aggregator.releaseCandidate(
        decoded.securityId,
        decoded.source,
        decoded.bucketStartMs,
      );
      this.clearDueTracking(member);
      return;
    }

    const hardHorizon =
      decoded.bucketStartMs + 60_000 + FINALIZATION_HARD_HORIZON_MS;
    if (now >= hardHorizon) {
      await this.releaseAtHardHorizon(client, tradingDay, member, decoded);
      return;
    }

    const sealed = this.aggregator.freezeCandidate(
      decoded.securityId,
      decoded.source,
      decoded.bucketStartMs,
    );
    if (sealed) {
      const committed = await this.finalizer.seal(client, sealed, now);
      if (committed) {
        this.aggregator.commitCandidate(
          decoded.securityId,
          decoded.source,
          decoded.bucketStartMs,
        );
        this.clearDueTracking(member);
      }
      return;
    }

    const reason = this.expectedDueMembers.has(member)
      ? 'no_snapshot'
      : 'backend_restart_open_state_lost';
    const committed = await this.finalizer.discardDue(
      client,
      decoded,
      reason,
      now,
    );
    if (committed) this.clearDueTracking(member);
  }

  private async releaseAtHardHorizon(
    client: Redis,
    tradingDay: string,
    member: string,
    decoded: ReturnType<typeof decodeDueMember>,
  ): Promise<void> {
    try {
      await client.zrem(dueKey(tradingDay), member);
    } catch (error) {
      this.logger.error(
        `Hard-horizon due cleanup failed for securityId=${decoded.securityId} source=${decoded.source} bucket ${decoded.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
    this.aggregator.releaseCandidate(
      decoded.securityId,
      decoded.source,
      decoded.bucketStartMs,
    );
    this.clearDueTracking(member);
    this.logger.error(
      `finalization_horizon_exceeded securityId=${decoded.securityId} source=${decoded.source} bucket=${decoded.bucketStartMs}`,
    );
  }

  private clearDueTracking(member: string): void {
    this.registeredDueMembers.delete(member);
    this.expectedDueMembers.delete(member);
  }

  private async isAlreadySealed(
    client: Redis,
    tradingDay: string,
    decoded: ReturnType<typeof decodeDueMember>,
  ): Promise<boolean> {
    try {
      const wm = await client.hgetall(
        watermarkKey(tradingDay, decoded.source, decoded.providerSymbol),
      );
      const sealedThrough = Number(wm.sealedThroughBucket ?? 0);
      return sealedThrough >= decoded.bucketStartMs;
    } catch {
      return false;
    }
  }

  private currentTradingDay(nowMs: number): string | null {
    const iso = new Date(nowMs).toISOString();
    const bucket = resolveCandleBucket(iso);
    if (bucket) return bucket.tradingDay;
    const zoned = toZonedTime(new Date(nowMs), 'Asia/Shanghai');
    return [
      zoned.getFullYear().toString().padStart(4, '0'),
      (zoned.getMonth() + 1).toString().padStart(2, '0'),
      zoned.getDate().toString().padStart(2, '0'),
    ].join('');
  }
}
