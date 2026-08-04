import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  STRATEGY_TRIGGER_BULLMQ_PREFIX,
  STRATEGY_TRIGGER_QUEUE_NAME,
  STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  type CandleFinalizedTriggerV1,
} from '@app/signal';
import {
  CandleFinalizedJobProcessor,
  type CandleFinalizedJobResult,
} from './candle-finalized-job.processor';

@Processor(STRATEGY_TRIGGER_QUEUE_NAME, {
  concurrency: STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: STRATEGY_TRIGGER_BULLMQ_PREFIX,
})
export class CandleFinalizedBullMqWorker extends WorkerHost {
  constructor(private readonly processor: CandleFinalizedJobProcessor) {
    super();
  }

  process(
    job: Job<CandleFinalizedTriggerV1, CandleFinalizedJobResult, string>,
  ): Promise<CandleFinalizedJobResult> {
    return this.processor.process(job.name, job.data);
  }
}
