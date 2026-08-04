import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import { CandleFinalizedBullMqWorker } from './candle-finalized-bullmq.worker';

describe('CandleFinalizedBullMqWorker', () => {
  it('delegates the BullMQ job to the strict signal processor', async () => {
    const result = { outcome: 'completed', candidates: [] } as const;
    const processor = { process: jest.fn().mockResolvedValue(result) };
    const worker = new CandleFinalizedBullMqWorker(processor as never);
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
  });
});
