import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import {
  closedCandleKey,
  decodeRealtimeClosedCandleRecordV1,
  dueKey,
  manifestKey,
  watermarkKey,
} from '@app/realtime';
import type { CandleFinalizedTriggerV1 } from '@app/signal';
import { DataSource } from '@app/shared-data';
import type Redis from 'ioredis';
import { Clock } from '../clock.service';
import { RealtimeRedisService } from '../realtime-redis.service';
import { RealtimeSecurityAllowlistService } from '../realtime-security-allowlist.service';
import {
  CANDLE_FINALIZATION_HANDOFF_PORT,
  type CandleFinalizationHandoffPort,
} from './candle-finalization-handoff.port';
import { RealtimeStrategyHandoffObservabilityService } from './realtime-strategy-handoff-observability.service';

export type StartupCompensationOutcome = 'not_enabled' | 'completed' | 'failed';

/** One bounded, same-day best-effort recovery pass. It is not a reconciler. */
@Injectable()
export class RealtimeStrategyStartupCompensationService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    RealtimeStrategyStartupCompensationService.name,
  );
  private started = false;
  private outcome: StartupCompensationOutcome = 'not_enabled';
  private submitted = 0;

  constructor(
    private readonly redis: RealtimeRedisService,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    private readonly clock: Clock,
    @Optional()
    @Inject(CANDLE_FINALIZATION_HANDOFF_PORT)
    private readonly handoff?: CandleFinalizationHandoffPort,
    @Optional()
    private readonly observability?: RealtimeStrategyHandoffObservabilityService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.started || !this.handoff) return;
    this.started = true;
    try {
      await this.runOnce();
      this.outcome = 'completed';
      this.observability?.recordStartup(this.outcome, this.submitted);
      this.logger.log(
        `Realtime strategy same-day best-effort startup compensation completed; submitted=${this.submitted}`,
      );
    } catch (error) {
      this.outcome = 'failed';
      this.observability?.recordStartup(this.outcome, this.submitted);
      this.logger.error(
        `Realtime strategy same-day best-effort startup compensation failed after submitted=${this.submitted}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  snapshot(): Readonly<{
    outcome: StartupCompensationOutcome;
    submitted: number;
  }> {
    return Object.freeze({ outcome: this.outcome, submitted: this.submitted });
  }

  private async runOnce(): Promise<void> {
    const client = this.redis.client;
    if (!client || !this.redis.isAvailable()) {
      throw new Error('current-day market Redis is unavailable');
    }
    const tradingDay = shanghaiDayCompact(this.clock.nowDate());
    const triggers: CandleFinalizedTriggerV1[] = [];
    for (const source of [DataSource.TDX, DataSource.QMT] as const) {
      for (const { securityId } of this.allowlist.list(source)) {
        triggers.push(
          ...(await readManifestReachableFinalizations(
            client,
            tradingDay,
            source,
            securityId,
          )),
        );
      }
    }
    triggers.sort(compareTriggers);
    for (const trigger of triggers) {
      await this.handoff!.publish(trigger);
      this.submitted += 1;
    }
  }
}

async function readManifestReachableFinalizations(
  client: Pick<Redis, 'hgetall'>,
  tradingDay: string,
  source: 'tdx' | 'qmt',
  securityId: number,
): Promise<readonly CandleFinalizedTriggerV1[]> {
  const manifestK = manifestKey(tradingDay, source, securityId);
  const manifest = await client.hgetall(manifestK);
  if (Object.keys(manifest).length === 0) return [];

  const closedK = closedCandleKey(tradingDay, source, securityId);
  const watermarkK = watermarkKey(tradingDay, source, securityId);
  const dueK = dueKey(tradingDay);
  const expected = new Map<string, string>([
    ['closed', closedK],
    ['watermark', watermarkK],
    ['due', dueK],
  ]);
  for (const [field, value] of Object.entries(manifest)) {
    if (expected.get(field) !== value) {
      throw new Error(`invalid current-day candle manifest field ${field}`);
    }
  }
  if (manifest.watermark !== watermarkK || manifest.due !== dueK) {
    throw new Error('current-day candle manifest is incomplete');
  }

  const triggers: CandleFinalizedTriggerV1[] = [];
  if (manifest.closed === closedK) {
    const closed = await client.hgetall(closedK);
    for (const [timestampText, raw] of Object.entries(closed)) {
      const timestampMs = parseBucketTimestamp(timestampText, tradingDay);
      const record = decodeRealtimeClosedCandleRecordV1(parseJson(raw));
      triggers.push({
        contractVersion: 1,
        securityId,
        source,
        period: '1m',
        triggerTime: new Date(timestampMs).toISOString(),
        outcome: 'sealed',
        triggerPrice: record.c,
      });
    }
  }

  const watermark = await client.hgetall(watermarkK);
  const terminalMs = parseBucketTimestamp(
    watermark.sealedThroughBucket,
    tradingDay,
  );
  if (watermark.outcome === 'closed') {
    if (!triggers.some((item) => Date.parse(item.triggerTime) === terminalMs)) {
      throw new Error('closed watermark has no matching sealed candle');
    }
  } else if (watermark.outcome === 'discarded') {
    triggers.push({
      contractVersion: 1,
      securityId,
      source,
      period: '1m',
      triggerTime: new Date(terminalMs).toISOString(),
      outcome: 'discarded',
      triggerPrice: null,
    });
  } else {
    throw new Error('current-day candle watermark outcome is invalid');
  }
  return triggers;
}

function parseBucketTimestamp(value: string | undefined, tradingDay: string) {
  const timestampMs = Number(value);
  if (
    !Number.isSafeInteger(timestampMs) ||
    timestampMs <= 0 ||
    shanghaiDayCompact(new Date(timestampMs)) !== tradingDay
  ) {
    throw new Error('current-day candle bucket timestamp is invalid');
  }
  return timestampMs;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new TypeError('closed-candle record must be valid JSON');
  }
}

function compareTriggers(
  left: CandleFinalizedTriggerV1,
  right: CandleFinalizedTriggerV1,
): number {
  return (
    Date.parse(left.triggerTime) - Date.parse(right.triggerTime) ||
    left.source.localeCompare(right.source) ||
    left.securityId - right.securityId
  );
}

function shanghaiDayCompact(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(value)
    .replaceAll('-', '');
}
