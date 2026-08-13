import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import { QueryFailedError } from 'typeorm';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { AlertFanoutService } from './alert-fanout.service';

type Repo = {
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  save: jest.Mock;
};

function mockRepo(): Repo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AlertFanoutService', () => {
  let alertEvents: Repo;
  let deliveries: Repo;
  let queue: { enqueueChannel: jest.Mock };
  let service: AlertFanoutService;

  function makeService(adapters: ChannelAdapter[]): AlertFanoutService {
    return new AlertFanoutService(
      alertEvents as any,
      deliveries as any,
      adapters,
      queue as any,
    );
  }

  beforeEach(() => {
    alertEvents = mockRepo();
    deliveries = mockRepo();
    queue = { enqueueChannel: jest.fn().mockResolvedValue(undefined) };
    const wechat: ChannelAdapter = {
      channel: NotificationChannel.WECHAT,
      send: jest.fn(),
    };
    const qq: ChannelAdapter = {
      channel: NotificationChannel.QQ,
      send: jest.fn(),
    };
    service = makeService([wechat, qq]);
  });

  it('creates a pending delivery row + enqueues per channel on first fanout', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 5 });
    deliveries.findOne.mockResolvedValue(null); // no existing rows

    await service.run({ contractVersion: 1, alertEventId: 5 });

    expect(deliveries.save).toHaveBeenCalledTimes(2);
    expect(deliveries.save).toHaveBeenCalledWith({
      strategyAlertEventId: 5,
      channel: NotificationChannel.WECHAT,
      status: StrategyAlertDeliveryStatus.PENDING,
      attemptCount: 0,
    });
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      5,
      NotificationChannel.WECHAT,
    );
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      5,
      NotificationChannel.QQ,
    );
  });

  it('skips terminal (SENT/DEAD_LETTERED) deliveries, still enqueues PENDING/FAILED', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 5 });
    deliveries.findOne
      .mockResolvedValueOnce({
        status: StrategyAlertDeliveryStatus.SENT,
      }) // wechat done
      .mockResolvedValueOnce({
        status: StrategyAlertDeliveryStatus.PENDING,
      }); // qq pending

    await service.run({ contractVersion: 1, alertEventId: 5 });

    // wechat skipped (no save, no enqueue); qq enqueued (no new save since row exists)
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(1);
    expect(queue.enqueueChannel).toHaveBeenCalledWith(
      5,
      NotificationChannel.QQ,
    );
    expect(deliveries.save).not.toHaveBeenCalled();
  });

  it('does nothing if the AlertEvent was deleted', async () => {
    alertEvents.findOne.mockResolvedValueOnce(null);
    await service.run({ contractVersion: 1, alertEventId: 5 });
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
    expect(deliveries.save).not.toHaveBeenCalled();
  });

  it('fails the AlertEvent when no channels are configured', async () => {
    service = makeService([]);
    alertEvents.findOne.mockResolvedValueOnce({ id: 5 });
    await service.run({ contractVersion: 1, alertEventId: 5 });
    expect(alertEvents.update).toHaveBeenCalledWith(5, {
      status: StrategyAlertStatus.FAILED,
    });
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
  });

  it('swallows the exact delivery-row unique-constraint race (concurrent fanout)', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 5 });
    deliveries.findOne.mockResolvedValue(null);
    deliveries.save.mockRejectedValueOnce(
      dupError(
        "Duplicate entry '5-wechat' for key 'strategy_alert_deliveries.uq_strategy_alert_deliveries_event_channel'",
      ),
    );

    await service.run({ contractVersion: 1, alertEventId: 5 });

    // still enqueued despite the dup-entry on save
    expect(queue.enqueueChannel).toHaveBeenCalledTimes(2);
  });

  it('fails the job loudly when delivery-row save fails for a non-unique reason', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 5 });
    deliveries.findOne.mockResolvedValue(null);
    const failure = new Error('connection lost');
    deliveries.save.mockRejectedValueOnce(failure);

    await expect(
      service.run({ contractVersion: 1, alertEventId: 5 }),
    ).rejects.toBe(failure);
    // No channel job for a row that does not exist
    expect(queue.enqueueChannel).not.toHaveBeenCalled();
  });
});

function dupError(sqlMessage: string): Error {
  const driver = Object.assign(new Error(sqlMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage,
  });
  return new QueryFailedError('INSERT', [], driver);
}
