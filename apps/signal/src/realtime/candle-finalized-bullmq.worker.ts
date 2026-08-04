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
  RealtimeStrategyJobDeadlineExceededError,
  type CandleFinalizedJobResult,
} from './candle-finalized-job.processor';
import { SignalRuntimeMutex } from '../signal-runtime-mutex.service';
import { SignalHealthStateService } from '../signal-health-state.service';

@Processor(STRATEGY_TRIGGER_QUEUE_NAME, {
  concurrency: STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: STRATEGY_TRIGGER_BULLMQ_PREFIX,
})
export class CandleFinalizedBullMqWorker extends WorkerHost {
  constructor(
    private readonly processor: CandleFinalizedJobProcessor,
    private readonly runtimeMutex: SignalRuntimeMutex,
    private readonly healthState: SignalHealthStateService,
  ) {
    super();
  }

  async process(
    job: Job<CandleFinalizedTriggerV1, CandleFinalizedJobResult, string>,
  ): Promise<CandleFinalizedJobResult> {
    this.healthState.recordJobStarted();
    try {
      const result = await this.runtimeMutex.run(() =>
        this.processor.process(job.name, job.data),
      );
      const diagnostics = this.processor.diagnostics();
      this.healthState.recordJobSucceeded({
        acceptedAt: new Date().toISOString(),
        outcome: result.outcome,
        acceptedTriggerTime: diagnostics.acceptedTriggerTime,
        evaluated: diagnostics.evaluated,
        windowGroupCount: diagnostics.groupCount,
        rawBarCount: diagnostics.rawBarCount,
        derivedBarCount: diagnostics.derivedBarCount,
        activeEpisodeCount: diagnostics.activeEpisodeCount,
        evaluationOutcome: diagnostics.lastOutcome,
        persistenceOutcome: diagnostics.lastPersistenceOutcome,
      });
      return result;
    } catch (error) {
      const diagnostics = this.processor.diagnostics();
      this.healthState.recordJobFailed({
        failureCode: classifyJobFailure(error, diagnostics),
        failedAt: new Date().toISOString(),
        acceptedTriggerTime: diagnostics.acceptedTriggerTime,
        evaluationStarted: diagnostics.evaluationStarted,
        windowGroupCount: diagnostics.groupCount,
        rawBarCount: diagnostics.rawBarCount,
        derivedBarCount: diagnostics.derivedBarCount,
        activeEpisodeCount: diagnostics.activeEpisodeCount,
        persistenceOutcome: diagnostics.lastPersistenceOutcome,
      });
      throw error;
    }
  }
}

function classifyJobFailure(
  error: unknown,
  diagnostics: ReturnType<CandleFinalizedJobProcessor['diagnostics']>,
): string {
  if (error instanceof RealtimeStrategyJobDeadlineExceededError) {
    return error.code;
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return 'INVALID_REALTIME_STRATEGY_JOB';
  }
  if (diagnostics.lastPersistenceOutcome === 'failed') {
    return 'LIVE_STRATEGY_PERSISTENCE_FAILED';
  }
  if (diagnostics.evaluationStarted) {
    return 'REALTIME_STRATEGY_EVALUATION_FAILED';
  }
  return 'REALTIME_MARKET_DATA_READ_FAILED';
}
