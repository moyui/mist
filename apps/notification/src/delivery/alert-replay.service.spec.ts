import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import { AlertReplayService } from './alert-replay.service';

type Repo = {
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
};

function mockRepo(): Repo {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AlertReplayService', () => {
  let alertEvents: Repo;
  let deliveries: Repo;
  let queue: { enqueueChannelReplay: jest.Mock };
  let service: AlertReplayService;

  beforeEach(() => {
    alertEvents = mockRepo();
    deliveries = mockRepo();
    queue = { enqueueChannelReplay: jest.fn().mockResolvedValue(undefined) };
    service = new AlertReplayService(
      alertEvents as any,
      deliveries as any,
      queue as any,
    );
  });

  it('throws NotFound when the AlertEvent does not exist', async () => {
    alertEvents.findOne.mockResolvedValueOnce(null);
    await expect(service.replay(99)).rejects.toThrow(/not found/i);
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
  });

  it('returns replayed=0 when no stuck deliveries', async () => {
    alertEvents.findOne.mockResolvedValueOnce({ id: 1 });
    deliveries.find.mockResolvedValueOnce([]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 0 });
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('resets stuck rows to PENDING, re-enqueues each, drops AlertEvent to PENDING', async () => {
    alertEvents.findOne.mockResolvedValueOnce({
      id: 1,
      status: StrategyAlertStatus.FAILED,
    });
    deliveries.find.mockResolvedValueOnce([
      {
        id: 10,
        strategyAlertEventId: 1,
        channel: NotificationChannel.WECHAT,
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      },
      {
        id: 11,
        strategyAlertEventId: 1,
        channel: NotificationChannel.QQ,
        status: StrategyAlertDeliveryStatus.FAILED,
      },
    ]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 2 });
    // each stuck row reset
    expect(deliveries.update).toHaveBeenCalledWith(10, {
      status: StrategyAlertDeliveryStatus.PENDING,
      attemptCount: 0,
      lastError: null,
    });
    expect(deliveries.update).toHaveBeenCalledWith(11, {
      status: StrategyAlertDeliveryStatus.PENDING,
      attemptCount: 0,
      lastError: null,
    });
    // re-enqueued per channel
    expect(queue.enqueueChannelReplay).toHaveBeenCalledWith(
      1,
      NotificationChannel.WECHAT,
    );
    expect(queue.enqueueChannelReplay).toHaveBeenCalledWith(
      1,
      NotificationChannel.QQ,
    );
    // aggregate reset so reconcile can re-evaluate
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.PENDING,
    });
  });

  it('is a no-op when the query returns no stuck rows (SENT excluded by query)', async () => {
    // The service queries with status In([FAILED, DEAD_LETTERED]); SENT rows never
    // appear in the result, so an all-SENT event yields [] and nothing is replayed.
    alertEvents.findOne.mockResolvedValueOnce({ id: 1 });
    deliveries.find.mockResolvedValueOnce([]);
    const res = await service.replay(1);
    expect(res).toEqual({ replayed: 0 });
    expect(queue.enqueueChannelReplay).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });
});
