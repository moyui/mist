import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  CANDLE_FINALIZED_JOB_NAME,
  CANDLE_FINALIZED_JOB_OPTIONS,
  STRATEGY_TRIGGER_QUEUE_NAME,
  candleFinalizedJobId,
  decodeCandleFinalizedTriggerV1,
  type CandleFinalizedTriggerV1,
} from '@app/signal';
import type { CandleFinalizationHandoffPort } from './candle-finalization-handoff.port';

@Injectable()
export class BullMqCandleFinalizationHandoffService
  implements CandleFinalizationHandoffPort
{
  constructor(
    @InjectQueue(STRATEGY_TRIGGER_QUEUE_NAME)
    private readonly queue: Queue<CandleFinalizedTriggerV1>,
  ) {}

  async publish(trigger: CandleFinalizedTriggerV1): Promise<void> {
    const accepted = decodeCandleFinalizedTriggerV1(trigger);
    await this.queue.add(CANDLE_FINALIZED_JOB_NAME, accepted, {
      ...CANDLE_FINALIZED_JOB_OPTIONS,
      jobId: candleFinalizedJobId(accepted),
    });
  }
}
