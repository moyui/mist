import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REALTIME_CANDLE_GRACE_LIMITS,
  REALTIME_CANDLE_QUEUE_LIMITS,
  REALTIME_CANDLE_TERMINAL_GRACE_LIMITS,
} from '@app/config';
import { DataSource } from '@app/shared-data';
import { toZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';
import type Redis from 'ioredis';
import { Clock } from '../clock.service';
import { RealtimeRedisService } from '../realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';
import type { CanonicalRealtimeSnapshot } from '../realtime.types';
import type { RealtimeSource } from '../realtime.types';
import { OpenCandleAggregator } from './open-candle-aggregator';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { withCandleSpan } from '../observability/tracer';
import { CandleFinalizer } from './candle-finalizer';
import { KeyedQueue } from './keyed-queue';
import {
  resolveCandleBucket,
  isSessionTerminalBucket,
} from './candle-bucket.util';
import type { CandleBucket } from './candle.types';
import { marketSeriesKey } from './market-series-key';
import type {
  RealtimeCandleProductMode,
  RealtimeCandleRuntimeObservation,
} from './realtime-candle-health.types';
import {
  dueKey,
  encodeDueMember,
  decodeDueMember,
  manifestKey,
  closedCandleKey,
  watermarkKey,
  marketDayExpiryEpochSeconds,
  REALTIME_REDIS_RANGE_BATCH_SIZE,
  REALTIME_REDIS_RECORD_LIMITS,
  assertRealtimeRedisBytes,
} from '../realtime-redis.constants';
import type { CandleFinalizedTriggerV1 } from '@app/signal';
import {
  CANDLE_FINALIZATION_HANDOFF_PORT,
  type CandleFinalizationHandoffPort,
} from '../strategy-trigger/candle-finalization-handoff.port';
import { RealtimeStrategyHandoffObservabilityService } from '../strategy-trigger/realtime-strategy-handoff-observability.service';

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
  private readonly mode: RealtimeCandleProductMode;
  private readonly graceMs: number;
  private readonly terminalGraceMs: number;
  private readonly queue: KeyedQueue;
  private readonly expectedSeries = new Map<string, ExpectedSeriesState>();
  private readonly registeredDueMembers = new Set<string>();
  private readonly expectedDueMembers = new Set<string>();
  private readonly dueInFlight = new Set<string>();
  private scannerTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private startupReplayPending = true;
  private startupEligibleBucketStartMs: number | null = null;
  private recoveryGapCount = 0;
  private recoveryGapLastFailureAtMs: number | null = null;
  private snapshotOverflowCount = 0;
  private snapshotOverflowLastFailureAtMs: number | null = null;
  private dueAdmissionOverflowCount = 0;
  private dueAdmissionOverflowLastFailureAtMs: number | null = null;
  private readonly lateAfterGraceCounts = new Map<string, number>();
  private readonly candidateCapacityExceededCounts = new Map<string, number>();

  private recordCount(
    counts: Map<string, number>,
    source: string,
    securityId: number,
  ): void {
    const key = `${source}:${securityId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  private quantityMissingFrameCount = 0;
  private dueScanFailureCount = 0;
  private dueScanLastFailureAtMs: number | null = null;
  private dueRegistrationFailureCount = 0;
  private dueRegistrationLastFailureAtMs: number | null = null;
  private finalizationHorizonExceededCount = 0;
  private finalizationHorizonExceededLastFailureAtMs: number | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
    private readonly redis: RealtimeRedisService,
    private readonly aggregator: OpenCandleAggregator,
    private readonly finalizer: CandleFinalizer,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    @Optional()
    @Inject(CANDLE_FINALIZATION_HANDOFF_PORT)
    private readonly finalizationHandoff?: CandleFinalizationHandoffPort,
    @Optional()
    private readonly handoffObservability?: RealtimeStrategyHandoffObservabilityService,
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
    this.terminalGraceMs =
      this.config.get<number>('REALTIME_CANDLE_TERMINAL_GRACE_MS') ??
      REALTIME_CANDLE_TERMINAL_GRACE_LIMITS.default;
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
    this.initializeStartupBoundary();
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
    this.redis.disconnectOwned();
  }

  /**
   * Entry point from {@link RealtimeSnapshotIngressService.handleSnapshot}.
   * Records `acceptedAt` synchronously (design line 245), then submits the
   * snapshot to the per-market-series queue for ordered aggregation + Redis writes.
   */
  handleSnapshot(snapshot: CanonicalRealtimeSnapshot): void {
    if (this.stopping || this.mode === 'off' || !this.redis.isAvailable()) {
      const reason = this.stopping
        ? 'stopping'
        : this.mode === 'off'
          ? 'mode_off'
          : 'redis_unavailable';
      trace.getActiveSpan()?.addEvent('ingest_gated', { reason });
      trace.getActiveSpan()?.setAttribute('ingestGated', reason);
      this.logger.warn(
        `candle ingest_gated reason=${reason} securityId=${snapshot.securityId} source=${snapshot.source}`,
      );
      return;
    }

    const acceptedAt = this.clock.now();
    const key = marketSeriesKey(snapshot.securityId, snapshot.source);

    const accepted = this.queue.enqueue(key, () =>
      this.processSnapshot(snapshot, acceptedAt),
    );
    if (!accepted) {
      this.snapshotOverflowCount++;
      this.snapshotOverflowLastFailureAtMs = acceptedAt;
      trace.getActiveSpan()?.addEvent('queue_overflow', {
        securityId: snapshot.securityId,
      });
      trace.getActiveSpan()?.setAttribute('skippedReason', 'queue_overflow');
      this.logger.warn(
        `candle queue_overflow securityId=${snapshot.securityId} key=${key}`,
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
    if (!client) {
      trace.getActiveSpan()?.addEvent('redis_client_unavailable', {
        securityId: snapshot.securityId,
      });
      trace
        .getActiveSpan()
        ?.setAttribute('skippedReason', 'redis_client_unavailable');
      this.logger.warn(
        `candle redis_client_unavailable securityId=${snapshot.securityId} source=${snapshot.source}`,
      );
      return;
    }

    const snapshotBucket = snapshot.eventTime
      ? resolveCandleBucket(snapshot.eventTime)
      : null;
    if (
      snapshotBucket &&
      this.startupEligibleBucketStartMs !== null &&
      snapshotBucket.bucketStartMs < this.startupEligibleBucketStartMs
    ) {
      trace.getActiveSpan()?.addEvent('startup_boundary_skip', {
        securityId: snapshot.securityId,
        bucketStartMs: snapshotBucket.bucketStartMs,
      });
      trace
        .getActiveSpan()
        ?.setAttribute('skippedReason', 'startup_boundary_skip');
      trace
        .getActiveSpan()
        ?.setAttribute('bucketStartMs', snapshotBucket.bucketStartMs);
      this.logger.warn(
        `candle startup_boundary_skip securityId=${snapshot.securityId} bucket=${snapshotBucket.bucketStartMs}`,
      );
      return;
    }

    // Price-only frame observability: either cumulative quantity absent →
    // the aggregator holds both quantity windows (window-consistency rule).
    if (
      snapshot.cumulativeVolume === null ||
      snapshot.cumulativeAmount === null
    ) {
      this.quantityMissingFrameCount++;
      trace.getActiveSpan()?.addEvent('quantity_missing_frame', {
        securityId: snapshot.securityId,
        source: snapshot.source,
      });
      this.logger.warn(
        `candle quantity_missing_frame securityId=${snapshot.securityId} source=${snapshot.source}`,
      );
    }

    // Session-terminal buckets (11:30 / 15:00) absorb post-close tail frames
    // and the closing-auction print; their admission grace is extended so a
    // late frame is not rejected by the normal 5s `late_after_grace` cutoff.
    const effectiveGraceMs = snapshotBucket
      ? this.effectiveGraceMs(snapshotBucket.bucketStartMs)
      : this.graceMs;
    const outcome = this.aggregator.applySnapshot(snapshot, {
      acceptedAtMs: acceptedAt,
      graceMs: effectiveGraceMs,
    });

    const activeSpan = trace.getActiveSpan();
    switch (outcome.kind) {
      case 'skipped':
        if (outcome.reason === 'late_after_grace') {
          this.recordCount(
            this.lateAfterGraceCounts,
            snapshot.source,
            snapshot.securityId,
          );
          activeSpan?.setAttribute('skippedReason', 'late_after_grace');
          if (snapshotBucket) {
            activeSpan?.setAttribute(
              'bucketStartMs',
              snapshotBucket.bucketStartMs,
            );
          }
        } else if (outcome.reason === 'candidate_capacity_exceeded') {
          this.recordCount(
            this.candidateCapacityExceededCounts,
            snapshot.source,
            snapshot.securityId,
          );
          activeSpan?.setAttribute(
            'skippedReason',
            'candidate_capacity_exceeded',
          );
          if (snapshotBucket) {
            activeSpan?.setAttribute(
              'bucketStartMs',
              snapshotBucket.bucketStartMs,
            );
          }
        } else {
          // 4 reasons not counted before (no_event_time/out_of_session/
          // duplicate_or_late/not_aggregation_eligible) — span event + warn.
          activeSpan?.addEvent('skipped', { reason: outcome.reason });
          activeSpan?.setAttribute('skippedReason', outcome.reason);
          if (snapshotBucket) {
            activeSpan?.setAttribute(
              'bucketStartMs',
              snapshotBucket.bucketStartMs,
            );
          }
          this.logger.warn(
            `candle skipped reason=${outcome.reason} securityId=${snapshot.securityId} source=${snapshot.source}`,
          );
        }
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
   * Effective finalization/admission grace for a bucket.
   *
   * Session-terminal buckets (11:30 / 15:00) get the normal grace plus the
   * terminal grace (`REALTIME_CANDLE_TERMINAL_GRACE_MS`) so their sealing is
   * delayed enough to absorb post-close tail frames / the closing-auction
   * print, whose provider eventTime lands inside the terminal minute but may
   * arrive late. Normal buckets keep the plain grace.
   */
  private effectiveGraceMs(bucketStartMs: number): number {
    return isSessionTerminalBucket(bucketStartMs)
      ? this.graceMs + this.terminalGraceMs
      : this.graceMs;
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
    if (
      acceptedAt >
      bucket.bucketEndMs + this.effectiveGraceMs(bucket.bucketStartMs)
    ) {
      // Silent return before — now observable.
      trace.getActiveSpan()?.addEvent('due_registration_too_late', {
        securityId: identity.securityId,
        bucketStartMs: bucket.bucketStartMs,
      });
      this.logger.warn(
        `candle due_registration_too_late securityId=${identity.securityId} bucket=${bucket.bucketStartMs}`,
      );
      return false;
    }

    try {
      const dueScore =
        bucket.bucketEndMs + this.effectiveGraceMs(bucket.bucketStartMs);
      const member = encodeDueMember(
        identity.securityId,
        identity.source,
        bucket.bucketStartMs,
      );
      if (this.registeredDueMembers.has(member)) {
        if (expected) this.expectedDueMembers.add(member);
        return true;
      }

      const manifestK = manifestKey(
        bucket.tradingDay,
        identity.source,
        identity.securityId,
      );
      const manifest = {
        closed: closedCandleKey(
          bucket.tradingDay,
          identity.source,
          identity.securityId,
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
      const expiresAt = marketDayExpiryEpochSeconds(bucket.tradingDay);
      if (Math.floor(acceptedAt / 1_000) >= expiresAt) {
        throw new Error(`tradingDay=${bucket.tradingDay} is already expired`);
      }
      multi.expireat(manifestK, expiresAt);
      multi.expireat(dueKey(bucket.tradingDay), expiresAt);
      if ((await multi.exec()) === null) {
        throw new Error('due registration transaction returned null');
      }
      this.registeredDueMembers.add(member);
      if (expected) this.expectedDueMembers.add(member);
      return true;
    } catch (error) {
      this.dueRegistrationFailureCount++;
      trace.getActiveSpan()?.addEvent('due_registration_failed', {
        securityId: identity.securityId,
        bucketStartMs: bucket.bucketStartMs,
      });
      this.logger.warn(
        `candle due_registration_failed securityId=${identity.securityId} bucket=${bucket.bucketStartMs}`,
      );
      // Deterministic rejections (record byte limit, expired trading day) only
      // accumulate; transient runtime errors (MULTI/EXEC null or throw) also
      // refresh the timestamp that drives the windowed degraded verdict.
      const deterministic =
        error instanceof RangeError ||
        (error instanceof Error &&
          error.message.includes('is already expired'));
      if (!deterministic) {
        this.dueRegistrationLastFailureAtMs = acceptedAt;
      }
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
    // ioredis is created with offline queuing disabled. Nest lifecycle hooks can
    // run while the owned client is still connecting; that startup condition is
    // not a due-scan failure and the one-second scanner will retry once ready.
    if (client.status && client.status !== 'ready') return;

    const now = this.clock.now();
    await this.syncExpectedBuckets(client, now);
    const tradingDay = this.currentTradingDay(now);
    if (!tradingDay) return;
    if (this.startupReplayPending) {
      const replayed = await this.replayCurrentDayManifests(client, tradingDay);
      if (replayed) this.startupReplayPending = false;
    }

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
      this.dueScanFailureCount++;
      this.dueScanLastFailureAtMs = now;
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
        trace.getActiveSpan()?.addEvent('malformed_due_member', {
          member,
        });
        this.logger.warn(
          `candle malformed_due_member member=${member} error=${
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
        this.dueAdmissionOverflowCount++;
        this.dueAdmissionOverflowLastFailureAtMs = now;
        this.dueInFlight.delete(member);
        trace.getActiveSpan()?.addEvent('due_admission_overflow', {
          securityId: decoded.securityId,
        });
        this.logger.warn(
          `candle due_admission_overflow securityId=${decoded.securityId} source=${decoded.source}; due remains pending.`,
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

  private initializeStartupBoundary(): void {
    const now = this.clock.now();
    this.startupEligibleBucketStartMs = this.nextCompleteBucketStartMs(now);
    const current = resolveCandleBucket(new Date(now).toISOString());
    if (current && now > current.bucketStartMs) {
      this.recoveryGapCount++;
      this.recoveryGapLastFailureAtMs = now;
      this.logger.warn(
        `recovery_gap startup_mid_bucket bucket=${current.bucketStartMs}; valid aggregation resumes at ${this.startupEligibleBucketStartMs ?? 'unknown'}`,
      );
    }
  }

  private async replayCurrentDayManifests(
    client: Redis,
    tradingDay: string,
  ): Promise<boolean> {
    try {
      const members = await client.zrangebyscore(
        dueKey(tradingDay),
        0,
        '+inf',
        'LIMIT',
        0,
        REALTIME_REDIS_RANGE_BATCH_SIZE,
      );
      for (const member of members) {
        const decoded = decodeDueMember(member);
        this.registeredDueMembers.add(member);
        const manifestK = manifestKey(
          tradingDay,
          decoded.source,
          decoded.securityId,
        );
        const manifest = await client.hgetall(manifestK);
        assertRealtimeRedisBytes(
          'candle manifest record',
          JSON.stringify(manifest),
          REALTIME_REDIS_RECORD_LIMITS.manifest,
        );
        const allowed = new Set([
          closedCandleKey(tradingDay, decoded.source, decoded.securityId),
          watermarkKey(tradingDay, decoded.source, decoded.securityId),
          dueKey(tradingDay),
        ]);
        if (Object.values(manifest).some((value) => !allowed.has(value))) {
          throw new Error(
            `manifest contains a key outside securityId=${decoded.securityId} source=${decoded.source}`,
          );
        }
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Current-day manifest replay failed for ${tradingDay}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  diagnostics(): {
    recoveryGapCount: number;
    startupEligibleBucketStartMs: number | null;
  } {
    return {
      recoveryGapCount: this.recoveryGapCount,
      startupEligibleBucketStartMs: this.startupEligibleBucketStartMs,
    };
  }

  /** Process-local, identity-free input for the dedicated health reader. */
  runtimeObservation(): RealtimeCandleRuntimeObservation {
    const queue = this.queue.getStats();
    const aggregator = this.aggregator.diagnostics();
    const finalizer = this.finalizer.diagnostics();
    return {
      mode: this.mode,
      graceMs: this.graceMs,
      queue: {
        pendingGlobal: queue.pendingGlobal,
        maximumPendingPerSeries: Math.max(
          0,
          ...Object.values(queue.pendingByKey),
        ),
        snapshotOverflowTotal: this.snapshotOverflowCount,
        snapshotOverflowLastFailureAtMs: this.snapshotOverflowLastFailureAtMs,
        dueAdmissionOverflowTotal: this.dueAdmissionOverflowCount,
        dueAdmissionOverflowLastFailureAtMs:
          this.dueAdmissionOverflowLastFailureAtMs,
      },
      candle: {
        ...aggregator,
        skipTotals: aggregator.skipTotals,
        sealedTotal: finalizer.sealedTotal,
        discardTotals: finalizer.discardTotals,
        lateAfterGraceTotal: [...this.lateAfterGraceCounts.entries()].map(
          ([key, total]) => {
            const [source, securityId] = key.split(':');
            return {
              source: source as RealtimeSource,
              securityId: Number(securityId),
              total,
            };
          },
        ),
        candidateCapacityExceededTotal: [
          ...this.candidateCapacityExceededCounts.entries(),
        ].map(([key, total]) => {
          const [source, securityId] = key.split(':');
          return {
            source: source as RealtimeSource,
            securityId: Number(securityId),
            total,
          };
        }),
        quantityMissingFrameTotal: this.quantityMissingFrameCount,
        finalizationFailureTotal: finalizer.finalizationFailureTotal,
        finalizationLastFailureAtMs: finalizer.finalizationLastFailureAtMs,
        finalizationHorizonExceededTotal: this.finalizationHorizonExceededCount,
        finalizationHorizonExceededLastFailureAtMs:
          this.finalizationHorizonExceededLastFailureAtMs,
        recordLimitBreachTotal: finalizer.recordLimitBreachTotal,
        recoveryGapTotal: this.recoveryGapCount,
        recoveryGapLastFailureAtMs: this.recoveryGapLastFailureAtMs,
        maxSealedRecordBytes: finalizer.maxSealedRecordBytes,
        maxManifestBytes: finalizer.maxManifestBytes,
      },
      due: {
        scanFailureTotal: this.dueScanFailureCount,
        scanLastFailureAtMs: this.dueScanLastFailureAtMs,
        registrationFailureTotal: this.dueRegistrationFailureCount,
        registrationLastFailureAtMs: this.dueRegistrationLastFailureAtMs,
      },
    };
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
    await withCandleSpan('candle.due.finalize', async (span) => {
      span.setAttribute('source', decoded.source);
      span.setAttribute('securityId', decoded.securityId);
      span.setAttribute('bucketStartMs', decoded.bucketStartMs);
      if (await this.isAlreadySealed(client, tradingDay, decoded)) {
        span.addEvent('already_sealed');
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
        decoded.bucketStartMs +
        60_000 +
        FINALIZATION_HARD_HORIZON_MS +
        (isSessionTerminalBucket(decoded.bucketStartMs)
          ? this.terminalGraceMs
          : 0);
      if (now >= hardHorizon) {
        span.addEvent('finalization_horizon_exceeded');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'hard_horizon' });
        this.logger.warn(
          `candle finalization_horizon_exceeded securityId=${decoded.securityId} bucket=${decoded.bucketStartMs}`,
        );
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
          if (sealed.validity === 'valid') {
            span.addEvent('sealed');
            span.setAttribute('verdict', 'sealed');
            span.setStatus({ code: SpanStatusCode.OK });
            this.logger.log(
              `candle finalize source=${decoded.source} bucket=${decoded.bucketStartMs} result=sealed`,
            );
          } else {
            span.addEvent('discarded', {
              reason: sealed.invalidReason ?? 'invalid',
            });
            span.setAttribute('verdict', 'discarded');
            span.setAttribute(
              'discardReason',
              sealed.invalidReason ?? 'invalid',
            );
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: sealed.invalidReason ?? 'invalid',
            });
            this.logger.warn(
              `candle finalize source=${decoded.source} bucket=${decoded.bucketStartMs} result=discarded reason=${sealed.invalidReason ?? 'invalid'}`,
            );
          }
          this.publishFinalization(
            sealed.validity === 'valid'
              ? this.sealedTrigger(sealed)
              : this.discardedTrigger(
                  sealed.securityId,
                  sealed.source,
                  sealed.bucketStartMs,
                ),
          );
        }
        return;
      }

      const reason = this.expectedDueMembers.has(member)
        ? 'no_snapshot'
        : 'backend_restart_open_state_lost';
      span.addEvent('discarded', { reason });
      span.setAttribute('verdict', 'discarded');
      span.setAttribute('discardReason', reason);
      span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
      this.logger.warn(
        `candle discarded reason=${reason} securityId=${decoded.securityId} bucket=${decoded.bucketStartMs}`,
      );
      const committed = await this.finalizer.discardDue(
        client,
        decoded,
        reason,
        now,
      );
      if (committed) {
        this.clearDueTracking(member);
        this.publishFinalization(
          this.discardedTrigger(
            decoded.securityId,
            decoded.source,
            decoded.bucketStartMs,
          ),
        );
      }
    });
  }

  private sealedTrigger(candle: {
    securityId: number;
    source: RealtimeSource;
    bucketStartMs: number;
    close: number;
  }): CandleFinalizedTriggerV1 {
    return Object.freeze({
      contractVersion: 1,
      securityId: candle.securityId,
      source: candle.source,
      period: '1m',
      triggerTime: new Date(candle.bucketStartMs).toISOString(),
      outcome: 'sealed',
      triggerPrice: candle.close,
    });
  }

  private discardedTrigger(
    securityId: number,
    source: RealtimeSource,
    bucketStartMs: number,
  ): CandleFinalizedTriggerV1 {
    return Object.freeze({
      contractVersion: 1,
      securityId,
      source,
      period: '1m',
      triggerTime: new Date(bucketStartMs).toISOString(),
      outcome: 'discarded',
      triggerPrice: null,
    });
  }

  private publishFinalization(trigger: CandleFinalizedTriggerV1): void {
    if (!this.finalizationHandoff) return;
    void this.finalizationHandoff
      .publish(trigger)
      .then(() => this.handoffObservability?.recordLiveSuccess())
      .catch((error: unknown) => {
        this.handoffObservability?.recordLiveFailure();
        this.logger.error(
          `Realtime strategy handoff failed after candle commit for securityId=${trigger.securityId} source=${trigger.source} triggerTime=${trigger.triggerTime}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
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
    this.finalizationHorizonExceededCount++;
    this.finalizationHorizonExceededLastFailureAtMs = this.clock.now();
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
        watermarkKey(tradingDay, decoded.source, decoded.securityId),
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
    const zoned = toZonedTime(new Date(nowMs), ASIA_SHANGHAI_TIMEZONE);
    return [
      zoned.getFullYear().toString().padStart(4, '0'),
      (zoned.getMonth() + 1).toString().padStart(2, '0'),
      zoned.getDate().toString().padStart(2, '0'),
    ].join('');
  }
}
