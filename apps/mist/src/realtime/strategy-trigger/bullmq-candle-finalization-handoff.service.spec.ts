import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import { BullMqCandleFinalizationHandoffService } from './bullmq-candle-finalization-handoff.service';

describe('BullMqCandleFinalizationHandoffService', () => {
  it('adds one deterministic retained job', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new BullMqCandleFinalizationHandoffService(queue as never);
    const trigger = {
      contractVersion: 1,
      securityId: 9,
      source: 'tdx',
      period: '1m',
      triggerTime: '2026-08-04T06:44:00.000Z',
      outcome: 'sealed',
      triggerPrice: 28,
    } as const;

    await service.publish(trigger);

    expect(queue.add).toHaveBeenCalledWith(CANDLE_FINALIZED_JOB_NAME, trigger, {
      attempts: 1,
      jobId: `candlefinal-v1-tdx-9-1m-${Date.parse(trigger.triggerTime)}`,
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    });
  });
});
