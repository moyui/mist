import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import { CandleFinalizedBullMqWorker } from './candle-finalized-bullmq.worker';
import { SignalRuntimeMutex } from '../signal-runtime-mutex.service';

describe('CandleFinalizedBullMqWorker', () => {
  it('delegates the BullMQ job to the strict signal processor', async () => {
    const result = { outcome: 'completed', candidates: [] } as const;
    const processor = {
      process: jest.fn().mockResolvedValue(result),
      diagnostics: jest.fn().mockReturnValue({
        groupCount: 1,
        rawBarCount: 1,
        derivedBarCount: 0,
        activeEpisodeCount: 0,
        lastOutcome: 'evaluated_not_matched',
        lastPersistenceOutcome: null,
        acceptedTriggerTime: '2026-08-04T06:44:00.000Z',
        evaluationStarted: true,
        evaluated: true,
      }),
    };
    const health = {
      recordJobStarted: jest.fn(),
      recordJobSucceeded: jest.fn(),
      recordJobFailed: jest.fn(),
    };
    const worker = new CandleFinalizedBullMqWorker(
      processor as never,
      new SignalRuntimeMutex(),
      health as never,
    );
    const data = {
      contractVersion: 1,
      securityId: 9,
      source: 'tdx',
      period: '1m',
      triggerTime: '2026-08-04T06:44:00.000Z',
      outcome: 'sealed',
      triggerPrice: 28,
    } as const;

    await expect(
      worker.process({ name: CANDLE_FINALIZED_JOB_NAME, data } as never),
    ).resolves.toBe(result);
    expect(processor.process).toHaveBeenCalledWith(
      CANDLE_FINALIZED_JOB_NAME,
      data,
    );
    expect(health.recordJobStarted).toHaveBeenCalledTimes(1);
    expect(health.recordJobSucceeded).toHaveBeenCalledTimes(1);
  });
});
