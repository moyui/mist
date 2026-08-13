import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  StrategyAlertDelivery,
  StrategyAlertEvent,
  StrategyAlertStatus,
} from '@app/shared-data';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

/** Sweep cadence: one pass per minute. */
export const PENDING_SWEEP_INTERVAL_MS = 60_000;
/**
 * An event is only considered stranded once it has been PENDING for this long —
 * normal in-flight delivery creates per-channel rows within seconds, so 5
 * minutes never touches a healthy event while still recovering a Redis outage
 * promptly after it ends.
 */
export const PENDING_SWEEP_STALENESS_MS = 5 * 60_000;
/** Per-pass cap: stranded events are rare; bound the sweep's work per pass. */
export const PENDING_SWEEP_MAX_PER_PASS = 100;

/**
 * Outbox-style recovery relay (remediate-alert-delivery-integrity M2): the
 * strategy producer commits the AlertEvent and then best-effort enqueues the
 * fanout job — if the enqueue fails (Redis unavailable), the event stays
 * PENDING forever with no delivery rows. This sweep finds exactly those
 * stranded events (PENDING + older than the staleness threshold + NO
 * per-channel delivery rows at all) and re-enqueues the fanout. The
 * deterministic fanout job id collapses duplicate sweeps onto one job.
 *
 * Deliberately a process timer (@nestjs/schedule), NOT a BullMQ repeatable
 * job: the sweep must keep running while Redis is down (it reads MySQL, a
 * different failure domain) so the event is picked up on the first pass after
 * Redis recovers.
 */
@Injectable()
export class PendingAlertDeliverySweepService {
  private readonly logger = new Logger(PendingAlertDeliverySweepService.name);
  private running = false;
  private recoveredTotal = 0;

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    private readonly queue: AlertDeliveryQueueService,
  ) {}

  @Interval(PENDING_SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.running) return; // @Interval does not await async runs
    this.running = true;
    try {
      const candidates = await this.findStranded();
      for (const event of candidates) {
        await this.queue.enqueueFanout(event.id);
        this.recoveredTotal += 1;
        this.logger.log(
          `sweep re-enqueued stranded PENDING event=${event.id} (no delivery rows, age >= 5m)`,
        );
      }
      if (candidates.length > 0) {
        this.logger.log(
          `sweep pass recovered ${candidates.length} stranded event(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `sweep pass failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Process-local recovered count for the sweep metric. */
  getRecoveredTotal(): number {
    return this.recoveredTotal;
  }

  private async findStranded(): Promise<StrategyAlertEvent[]> {
    const stranded = await this.alertEvents.find({
      where: {
        status: StrategyAlertStatus.PENDING,
        createdAt: LessThanOrEqual(
          new Date(Date.now() - PENDING_SWEEP_STALENESS_MS),
        ),
      },
      take: PENDING_SWEEP_MAX_PER_PASS,
    });
    if (stranded.length === 0) return [];
    // Events with any delivery row (in-flight, retrying, or replay-reset
    // PENDING with FAILED rows) are owned by the normal pipeline; only events
    // the fanout never touched are stranded.
    const ids = stranded.map((event) => event.id);
    const withRows = await this.deliveries.find({
      where: { strategyAlertEventId: In(ids) },
      select: ['strategyAlertEventId'],
    });
    const rowed = new Set(withRows.map((row) => row.strategyAlertEventId));
    return stranded.filter((event) => !rowed.has(event.id));
  }
}
