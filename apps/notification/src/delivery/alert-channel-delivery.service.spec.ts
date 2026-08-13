import {
  NotificationChannel,
  StrategyAlertDeliveryStatus,
  StrategyAlertStatus,
} from '@app/shared-data';
import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { AlertChannelDeliveryService } from './alert-channel-delivery.service';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

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

const WECHAT = NotificationChannel.WECHAT;
const QQ = NotificationChannel.QQ;

function delivery(
  overrides: Partial<{
    id: number;
    strategyAlertEventId: number;
    channel: NotificationChannel;
    status: StrategyAlertDeliveryStatus;
    attemptCount: number;
  }> = {},
) {
  return {
    id: 7,
    strategyAlertEventId: 1,
    channel: WECHAT,
    status: StrategyAlertDeliveryStatus.PENDING,
    attemptCount: 0,
    ...overrides,
  };
}

describe('AlertChannelDeliveryService', () => {
  let alertEvents: Repo;
  let signals: Repo;
  let securities: Repo;
  let deliveries: Repo;
  let strategyDefinitions: Repo;
  let adapter: jest.Mocked<ChannelAdapter>;
  let service: AlertChannelDeliveryService;
  let counters: NotificationDeliveryCounters;

  beforeEach(() => {
    alertEvents = mockRepo();
    signals = mockRepo();
    securities = mockRepo();
    deliveries = mockRepo();
    strategyDefinitions = mockRepo();
    adapter = { channel: WECHAT, send: jest.fn() };
    counters = new NotificationDeliveryCounters();
    service = new AlertChannelDeliveryService(
      alertEvents as any,
      signals as any,
      securities as any,
      deliveries as any,
      strategyDefinitions as any,
      [adapter],
      counters,
    );
  });

  function primeEvidence(): void {
    alertEvents.findOne.mockResolvedValueOnce({
      id: 1,
      strategySignalId: 5,
      dedupeKey: 'live-v1:..',
    });
    signals.findOne.mockResolvedValueOnce({
      id: 5,
      securityId: 9,
      signalKind: 'entry',
      signalTime: new Date('2026-08-12T09:35:00+08:00'),
      contextSnapshot: { triggerPrice: 12.5 },
    });
    securities.findOne.mockResolvedValueOnce({
      id: 9,
      code: '000001',
      name: '平安银行',
    });
  }

  it('marks SENT + reconciles DELIVERED when adapter succeeds', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockResolvedValue({
      status: 'sent',
      providerMessageId: 'mid-1',
    });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.SENT },
    ]);

    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: WECHAT },
      0,
      5,
    );

    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.SENT,
        attemptCount: 1,
        providerMessageId: 'mid-1',
        sentAt: expect.any(Date),
        lastError: null,
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.DELIVERED,
    });
  });

  it('marks FAILED and throws on transient failure with retries remaining', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockResolvedValue({
      status: 'transient_failure',
      error: 'timeout',
    });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.FAILED },
    ]);

    await expect(
      service.run(
        { contractVersion: 1, alertEventId: 1, channel: WECHAT },
        0,
        5,
      ),
    ).rejects.toThrow(/transient delivery failure/);

    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.FAILED,
        attemptCount: 1,
        lastError: 'timeout',
      }),
    );
    // not DELIVERED (still has a non-sent channel)
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('dead-letters (no throw) on the last attempt of a transient failure', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockResolvedValue({
      status: 'transient_failure',
      error: 'still down',
    });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.DEAD_LETTERED },
    ]);

    // attemptsMade=4, maxAttempts=5 -> attempt 5 is the last
    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: WECHAT },
      4,
      5,
    );

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
        attemptCount: 1,
        lastError: 'still down',
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });

  it('dead-letters immediately on permanent failure (no retry, no throw)', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockResolvedValue({
      status: 'permanent_failure',
      error: 'not configured',
    });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.DEAD_LETTERED },
    ]);

    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: WECHAT },
      0,
      5,
    );

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      }),
    );
    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });

  it('treats a throwing adapter as a transient failure', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockRejectedValue(new Error('network reset'));
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.FAILED },
    ]);

    await expect(
      service.run(
        { contractVersion: 1, alertEventId: 1, channel: WECHAT },
        0,
        5,
      ),
    ).rejects.toThrow(/transient delivery failure/);

    expect(deliveries.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.FAILED,
        lastError: 'network reset',
      }),
    );
  });

  it('dead-letters when no adapter is configured for the channel', async () => {
    service = new AlertChannelDeliveryService(
      alertEvents as any,
      signals as any,
      securities as any,
      deliveries as any,
      strategyDefinitions as any,
      [], // no adapters configured
      counters,
    );
    deliveries.findOne.mockResolvedValueOnce(delivery({ channel: QQ }));
    alertEvents.findOne.mockResolvedValueOnce({
      id: 1,
      strategySignalId: 5,
      dedupeKey: 'live-v1:..',
    });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.DEAD_LETTERED },
    ]);

    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: QQ },
      0,
      5,
    );

    expect(deliveries.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: StrategyAlertDeliveryStatus.DEAD_LETTERED,
      }),
    );
    // signal/security never loaded (adapter check short-circuits before evidence build)
    expect(signals.findOne).not.toHaveBeenCalled();
  });

  it('is idempotent: skips when the delivery is already terminal', async () => {
    deliveries.findOne.mockResolvedValueOnce(
      delivery({ status: StrategyAlertDeliveryStatus.SENT }),
    );

    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: WECHAT },
      0,
      5,
    );

    expect(adapter.send).not.toHaveBeenCalled();
    expect(deliveries.update).not.toHaveBeenCalled();
    expect(alertEvents.update).not.toHaveBeenCalled();
  });

  it('reconciles FAILED when one channel is dead-lettered even if another is sent', async () => {
    deliveries.findOne.mockResolvedValueOnce(delivery());
    primeEvidence();
    adapter.send.mockResolvedValue({ status: 'sent' });
    deliveries.find.mockResolvedValueOnce([
      { status: StrategyAlertDeliveryStatus.SENT },
      { status: StrategyAlertDeliveryStatus.DEAD_LETTERED },
    ]);

    await service.run(
      { contractVersion: 1, alertEventId: 1, channel: WECHAT },
      0,
      5,
    );

    expect(alertEvents.update).toHaveBeenCalledWith(1, {
      status: StrategyAlertStatus.FAILED,
    });
  });
});
