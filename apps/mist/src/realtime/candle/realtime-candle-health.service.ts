import { DataSource } from '@app/shared-data';
import { Injectable } from '@nestjs/common';
import { toZonedTime } from 'date-fns-tz';
import { Clock } from '../clock.service';
import { RealtimeMarketObservabilityService } from '../realtime-market-observability.service';
import {
  closedCandleKey,
  dueKey,
  manifestKey,
  watermarkKey,
} from '../realtime-redis.constants';
import { RealtimeRedisService } from '../realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';
import type { RealtimeSource } from '../realtime.types';
import type {
  RealtimeCandleDegradedReason,
  RealtimeCandleHealthObservation,
} from './realtime-candle-health.types';
import { RealtimeMarketDataProductService } from './realtime-market-data-product.service';
import { marketSeriesKey } from './market-series-key';
import { RealtimeStrategyHandoffObservabilityService } from '../strategy-trigger/realtime-strategy-handoff-observability.service';

const RETENTION_LOOKBACK_DAYS = 7;

/** Builds the read-only, low-cardinality health view for mist-monitoring. */
@Injectable()
export class RealtimeCandleHealthService {
  private redisObservationFailureCount = 0;

  constructor(
    private readonly product: RealtimeMarketDataProductService,
    private readonly redis: RealtimeRedisService,
    private readonly clock: Clock,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    private readonly observability: RealtimeMarketObservabilityService,
    private readonly handoffObservability?: RealtimeStrategyHandoffObservabilityService,
  ) {}

  async observe(): Promise<RealtimeCandleHealthObservation> {
    const runtime = this.product.runtimeObservation();
    const quantityProfileRejections =
      this.observability.quantityRejectionObservations();
    const degradedReasons = degradedRuntimeReasons(
      runtime,
      quantityProfileRejections.length > 0,
    );
    const observation: RealtimeCandleHealthObservation = {
      ...runtime,
      status: runtime.mode === 'off' ? 'disabled' : 'ok',
      degradedReasons: [],
      due: {
        ...runtime.due,
        pendingCount: null,
        oldestLagMs: null,
      },
      redis: {
        available: this.redis.isAvailable(),
        usedMemoryBytes: null,
        aofSizeBytes: null,
        aofEnabled: null,
        aofLastWriteStatus: null,
        maxmemoryPolicy: null,
        currentDayMarketKeyCount: null,
        expiredMarketKeyCount: null,
        observationFailureTotal: this.redisObservationFailureCount,
      },
      quantityProfileRejections,
      strategyHandoff: this.handoffObservability?.snapshot(
        runtime.mode !== 'off',
      ) ?? {
        enabled: false,
        sharedRedisFailureDomain: true,
        liveEnqueue: {
          successTotal: 0,
          failureTotal: 0,
          lastOutcome: null,
        },
        startupCompensation: { outcome: 'not_enabled', submitted: 0 },
      },
    };

    if (runtime.mode === 'off') return observation;
    const client = this.redis.client;
    if (!client) {
      degradedReasons.add('redis_unavailable');
      return completeObservation(observation, degradedReasons);
    }

    try {
      const now = this.clock.now();
      const tradingDay = shanghaiCalendarDay(now, 0);
      const identities = this.activeMarketIdentities();
      const currentKeys = marketPartitionKeys(tradingDay, identities);
      const expiredKeys = Array.from(
        { length: RETENTION_LOOKBACK_DAYS },
        (_, index) =>
          marketPartitionKeys(shanghaiCalendarDay(now, index + 1), identities),
      ).flat();
      const [
        memoryInfo,
        persistenceInfo,
        policyResult,
        currentDayMarketKeyCount,
        expiredMarketKeyCount,
        pendingCount,
        oldestDue,
      ] = await Promise.all([
        client.info('memory'),
        client.info('persistence'),
        client.config('GET', 'maxmemory-policy'),
        client.exists(...currentKeys),
        client.exists(...expiredKeys),
        client.zcard(dueKey(tradingDay)),
        client.zrange(dueKey(tradingDay), 0, 0, 'WITHSCORES'),
      ]);
      const memory = parseRedisInfo(memoryInfo);
      const persistence = parseRedisInfo(persistenceInfo);
      const policy = Array.isArray(policyResult)
        ? (policyResult[1] ?? null)
        : null;
      observation.redis = {
        available: true,
        usedMemoryBytes: parseOptionalNonNegativeInteger(memory['used_memory']),
        aofSizeBytes: parseOptionalNonNegativeInteger(
          persistence['aof_current_size'],
        ),
        aofEnabled: persistence['aof_enabled'] === '1',
        aofLastWriteStatus: persistence['aof_last_write_status'] ?? null,
        maxmemoryPolicy: policy,
        currentDayMarketKeyCount,
        expiredMarketKeyCount,
        observationFailureTotal: this.redisObservationFailureCount,
      };
      observation.due.pendingCount = pendingCount;
      observation.due.oldestLagMs =
        oldestDue.length >= 2 ? Math.max(0, now - Number(oldestDue[1])) : null;
      if (!observation.redis.aofEnabled) {
        degradedReasons.add('redis_aof_disabled');
      }
      if (observation.redis.aofLastWriteStatus !== 'ok') {
        degradedReasons.add('redis_aof_error');
      }
      if (observation.redis.maxmemoryPolicy !== 'noeviction') {
        degradedReasons.add('redis_eviction_policy');
      }
      if (expiredMarketKeyCount > 0) {
        degradedReasons.add('redis_retention');
      }
    } catch {
      this.redisObservationFailureCount++;
      observation.redis.observationFailureTotal =
        this.redisObservationFailureCount;
      degradedReasons.add('redis_observation_failed');
    }

    return completeObservation(observation, degradedReasons);
  }

  private activeMarketIdentities(): Array<{
    securityId: number;
    source: RealtimeSource;
  }> {
    const identities = new Map<
      string,
      { securityId: number; source: RealtimeSource }
    >();
    for (const [source, entries] of [
      ['tdx', this.allowlist.list(DataSource.TDX)],
      ['qmt', this.allowlist.list(DataSource.QMT)],
    ] as const) {
      for (const entry of entries) {
        identities.set(marketSeriesKey(entry.securityId, source), {
          securityId: entry.securityId,
          source,
        });
      }
    }
    return [...identities.values()];
  }
}

function degradedRuntimeReasons(
  runtime: ReturnType<RealtimeMarketDataProductService['runtimeObservation']>,
  hasQuantityProfileRejections: boolean,
): Set<RealtimeCandleDegradedReason> {
  const reasons = new Set<RealtimeCandleDegradedReason>();
  if (
    runtime.queue.snapshotOverflowTotal > 0 ||
    runtime.queue.dueAdmissionOverflowTotal > 0
  ) {
    reasons.add('queue_overflow');
  }
  if (runtime.due.scanFailureTotal > 0) reasons.add('due_scan_failed');
  if (runtime.due.registrationFailureTotal > 0) {
    reasons.add('due_registration_failed');
  }
  if (runtime.candle.finalizationFailureTotal > 0) {
    reasons.add('finalization_failed');
  }
  if (runtime.candle.finalizationHorizonExceededTotal > 0) {
    reasons.add('finalization_horizon_exceeded');
  }
  if (runtime.candle.recordLimitBreachTotal > 0) {
    reasons.add('record_limit_breach');
  }
  if (runtime.candle.recoveryGapTotal > 0) reasons.add('recovery_gap');
  if (hasQuantityProfileRejections) {
    reasons.add('quantity_profile_rejected');
  }
  return reasons;
}

function completeObservation(
  observation: RealtimeCandleHealthObservation,
  degradedReasons: Set<RealtimeCandleDegradedReason>,
): RealtimeCandleHealthObservation {
  observation.degradedReasons = [...degradedReasons].sort();
  observation.status =
    observation.degradedReasons.length > 0 ? 'degraded' : 'ok';
  return observation;
}

function marketPartitionKeys(
  tradingDay: string,
  identities: ReadonlyArray<{
    securityId: number;
    source: RealtimeSource;
  }>,
): string[] {
  return [
    dueKey(tradingDay),
    ...identities.flatMap(({ securityId, source }) => [
      closedCandleKey(tradingDay, source, securityId),
      watermarkKey(tradingDay, source, securityId),
      manifestKey(tradingDay, source, securityId),
    ]),
  ];
}

function shanghaiCalendarDay(nowMs: number, daysAgo: number): string {
  const zoned = toZonedTime(new Date(nowMs), 'Asia/Shanghai');
  const date = new Date(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate() - daysAgo),
  );
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('');
}

function parseRedisInfo(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function parseOptionalNonNegativeInteger(
  value: string | undefined,
): number | null {
  if (value === undefined || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
