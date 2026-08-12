import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
} from '@app/shared-data';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

/**
 * Operator replay: re-push a failed/dead-lettered AlertEvent's deliveries without
 * re-running strategy. Resets each non-terminal-since delivery row to PENDING
 * (attempt_count=0, last_error=null) so the worker does not idempotently skip it,
 * re-enqueues fresh deliver.channel jobs (no jobId => always new), and drops the
 * AlertEvent back to PENDING so reconcile can re-evaluate as channels complete.
 */
@Injectable()
export class AlertReplayService {
  private readonly logger = new Logger(AlertReplayService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    private readonly queue: AlertDeliveryQueueService,
  ) {}

  async replay(alertEventId: number): Promise<{ replayed: number }> {
    const event = await this.alertEvents.findOne({
      where: { id: alertEventId },
    });
    if (!event) {
      throw new NotFoundException(`AlertEvent ${alertEventId} not found`);
    }

    const stuck = await this.deliveries.find({
      where: {
        strategyAlertEventId: alertEventId,
        status: In([
          StrategyAlertDeliveryStatus.FAILED,
          StrategyAlertDeliveryStatus.DEAD_LETTERED,
        ]),
      },
    });
    if (stuck.length === 0) {
      this.logger.log(
        `replay: no failed/dead-lettered deliveries for event ${alertEventId}`,
      );
      return { replayed: 0 };
    }

    for (const delivery of stuck) {
      await this.deliveries.update(delivery.id, {
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
        lastError: null,
      });
      await this.queue.enqueueChannelReplay(alertEventId, delivery.channel);
    }
    // Drop aggregate back to PENDING so reconcile re-evaluates on completion.
    await this.alertEvents.update(alertEventId, {
      status: StrategyAlertStatus.PENDING,
    });
    this.logger.log(
      `replay: re-enqueued ${stuck.length} channel(s) for event ${alertEventId}`,
    );
    return { replayed: stuck.length };
  }
}
