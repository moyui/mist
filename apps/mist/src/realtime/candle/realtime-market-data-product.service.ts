import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toZonedTime } from 'date-fns-tz';
import type Redis from 'ioredis';
import { Clock } from '../clock.service';
import { RealtimeRedisService } from '../realtime-redis.service';
import type { CanonicalRealtimeSnapshot } from '../realtime.types';
import { OpenCandleAggregator } from './open-candle-aggregator';
import { CandleFinalizer } from './candle-finalizer';
import { KeyedQueue } from './keyed-queue';
import { resolveCandleBucket } from './candle-bucket.util';
import type { ApplySnapshotOutcome } from './candle.types';
import {
  dueKey,
  encodeDueMember,
  decodeDueMember,
  manifestKey,
  closedCandleKey,
  watermarkKey,
  RETENTION_AFTER_DAY_END_HOURS,
} from '../realtime-redis.constants';

/** Default grace (ms) before a bucket is due for finalization. Design: "5s candidate". */
const DEFAULT_GRACE_MS = 5_000;
/** Due scanner interval. Design: "每秒扫描". */
const DUE_SCAN_INTERVAL_MS = 1_000;

/**
 * Product-layer orchestrator for the current-day realtime candle product (B1).
 *
 * Wires together the candle state machine ({@link OpenCandleAggregator}), the
 * Redis sealer ({@link CandleFinalizer}), the per-symbol {@link KeyedQueue},
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
  private scannerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
    private readonly redis: RealtimeRedisService,
    private readonly aggregator: OpenCandleAggregator,
    private readonly finalizer: CandleFinalizer,
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
      this.config.get<number>('REALTIME_CANDLE_GRACE_MS') ?? DEFAULT_GRACE_MS;
    this.queue = new KeyedQueue({
      maxPendingPerKey: 8,
      maxPendingGlobal: 256,
    });
  }

  onModuleInit(): void {
    if (this.mode === 'off' || !this.redis.isAvailable()) return;
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
   * snapshot to the per-symbol queue for ordered aggregation + Redis writes.
   */
  handleSnapshot(snapshot: CanonicalRealtimeSnapshot): void {
    if (this.mode === 'off' || !this.redis.isAvailable()) return;

    const acceptedAt = this.clock.now();
    const key = String(snapshot.securityId);

    const accepted = this.queue.enqueue(key, () =>
      this.processSnapshot(snapshot, acceptedAt),
    );
    if (!accepted) {
      this.logger.warn(
        `Queue overflow for ${key}; marking candle queue_overflow.`,
      );
      this.aggregator.markInvalid(
        snapshot.securityId,
        snapshot.source,
        'queue_overflow',
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

    // A2 (design 282): only frames within grace may mutate Node open state.
    if (snapshot.eventTime) {
      const bucket = resolveCandleBucket(snapshot.eventTime);
      if (bucket && acceptedAt > bucket.bucketEndMs + this.graceMs) {
        this.logger.debug(
          `Late frame for ${snapshot.providerSymbol} bucket ${bucket.bucketStartMs} (acceptedAt=${acceptedAt} > cutoff=${bucket.bucketEndMs + this.graceMs}); skipping candle mutation.`,
        );
        return;
      }
    }

    const outcome = this.aggregator.applySnapshot(snapshot);

    switch (outcome.kind) {
      case 'skipped':
        return;

      case 'opened':
        // A1 (design 185): register due ONLY on first bucket creation.
        await this.registerDueIfFirst(client, outcome, snapshot, acceptedAt);
        return;

      case 'updated':
        // Same bucket, subsequent frame — no Redis write (AOF stays lean).
        return;

      case 'rolled-over':
        if (outcome.sealed) {
          await this.finalizer.seal(client, outcome.sealed, acceptedAt);
        }
        return;

      case 'invalidated':
        // Bucket already registered when 'opened'; scanner seals as discarded.
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
    outcome: ApplySnapshotOutcome,
    snapshot: CanonicalRealtimeSnapshot,
    acceptedAt: number,
  ): Promise<void> {
    if (outcome.kind === 'skipped' || outcome.kind === 'rolled-over') return;
    const bucket = outcome.bucket;

    if (acceptedAt > bucket.bucketEndMs + this.graceMs) {
      return;
    }

    const dueScore = bucket.bucketEndMs + this.graceMs;
    const member = encodeDueMember(
      snapshot.securityId,
      snapshot.source,
      snapshot.providerSymbol,
      bucket.bucketStartMs,
    );

    try {
      const multi = client.multi();
      multi.zadd(dueKey(bucket.tradingDay), dueScore, member);
      multi.hset(
        manifestKey(
          bucket.tradingDay,
          snapshot.source,
          snapshot.providerSymbol,
        ),
        {
          closed: closedCandleKey(
            bucket.tradingDay,
            snapshot.source,
            snapshot.providerSymbol,
          ),
        },
      );
      multi.expire(
        manifestKey(
          bucket.tradingDay,
          snapshot.source,
          snapshot.providerSymbol,
        ),
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
      await multi.exec();
    } catch (error) {
      // A6 (design 303-304): mark candle redis_due_registration_failed.
      this.logger.error(
        `Due registration failed for ${snapshot.providerSymbol} bucket ${bucket.bucketStartMs}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.aggregator.markInvalid(
        snapshot.securityId,
        snapshot.source,
        'redis_due_registration_failed',
      );
    }
  }

  // ---- due scanner --------------------------------------------------------

  private async scanDue(): Promise<void> {
    const client = this.redis.client;
    if (!client) return;

    const now = this.clock.now();
    const tradingDay = this.currentTradingDay(now);
    if (!tradingDay) return;

    let members: string[];
    try {
      members = await client.zrangebyscore(dueKey(tradingDay), 0, now);
    } catch {
      return;
    }

    for (const member of members) {
      const decoded = decodeDueMember(member);
      const queueKey = String(decoded.securityId);

      this.queue.enqueue(queueKey, async () => {
        // A4 (design 283): read Redis watermark before finalizing.
        const sealed = this.aggregator.sealCurrent(
          decoded.securityId,
          decoded.source,
        );

        if (sealed) {
          const alreadySealed = await this.isAlreadySealed(client, decoded);
          if (!alreadySealed) {
            await this.finalizer.seal(client, sealed, now);
          }
        } else {
          // A5 (design 288-289): restart lost open state → discard.
          this.logger.warn(
            `Restart open-state loss for ${decoded.providerSymbol} bucket ${decoded.bucketStartMs}; discarding.`,
          );
          await this.finalizer.discardDue(
            client,
            decoded,
            'backend_restart_open_state_lost',
            now,
          );
        }
      });
    }
  }

  private async isAlreadySealed(
    client: Redis,
    decoded: ReturnType<typeof decodeDueMember>,
  ): Promise<boolean> {
    try {
      const wm = await client.hgetall(
        watermarkKey(
          this.currentTradingDay(this.clock.now()) ?? '',
          decoded.source,
          decoded.providerSymbol,
        ),
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
