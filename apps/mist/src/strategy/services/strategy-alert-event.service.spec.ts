import { NotFoundException } from '@nestjs/common';
import { StrategyAlertStatus } from '@app/shared-data';
import { StrategyAlertEventService } from './strategy-alert-event.service';

describe('StrategyAlertEventService', () => {
  const createHarness = () => {
    const events: any[] = [
      {
        id: 1,
        strategySignalId: 7,
        status: StrategyAlertStatus.PENDING,
        dedupeKey: 'dedupe-1',
        deliveryResult: null,
        acknowledgedAt: null,
      },
    ];
    const repository = {
      find: jest.fn(async () => events),
      findOne: jest.fn(async ({ where }) =>
        events.find((event) => event.id === where.id),
      ),
      save: jest.fn(async (event) => event),
    };
    const service = new StrategyAlertEventService(repository as any);

    return { service, repository, events };
  };

  it('marks alert events delivered with delivery result metadata', async () => {
    const { service, repository } = createHarness();

    const updated = await service.markDelivered(1, {
      deliveryResult: { channel: 'astrbot', messageId: 'msg-1' },
    });

    expect(updated).toMatchObject({
      id: 1,
      status: StrategyAlertStatus.DELIVERED,
      deliveryResult: { channel: 'astrbot', messageId: 'msg-1' },
      acknowledgedAt: null,
    });
    // save receives the modified entity; the public result is the VO view.
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, status: StrategyAlertStatus.DELIVERED }),
    );
    expect(updated).toBeInstanceOf(Object);
    expect(updated.constructor.name).toBe('StrategyAlertEventVo');
  });

  it('marks alert events failed with failure metadata', async () => {
    const { service } = createHarness();

    const updated = await service.markFailed(1, {
      deliveryResult: { channel: 'astrbot', error: 'bot unavailable' },
    });

    expect(updated).toMatchObject({
      id: 1,
      status: StrategyAlertStatus.FAILED,
      deliveryResult: { channel: 'astrbot', error: 'bot unavailable' },
      acknowledgedAt: null,
    });
  });

  it('keeps acknowledgement separate from delivery result metadata', async () => {
    const { service } = createHarness();

    await service.markDelivered(1, {
      deliveryResult: { channel: 'astrbot', messageId: 'msg-1' },
    });
    const acknowledged = await service.acknowledge(1);

    expect(acknowledged.status).toBe(StrategyAlertStatus.ACKED);
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledged.deliveryResult).toEqual({
      channel: 'astrbot',
      messageId: 'msg-1',
    });
  });

  it('throws when delivery target alert event does not exist', async () => {
    const { service } = createHarness();

    await expect(service.markDelivered(404, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.markFailed(404, {})).rejects.toThrow(
      NotFoundException,
    );
  });
});
