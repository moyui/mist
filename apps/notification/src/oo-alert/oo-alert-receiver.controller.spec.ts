import { OoAlertReceiverController } from './oo-alert-receiver.controller';

jest.mock('@app/timezone', () => ({
  TimezoneService: jest.fn(),
  isInTradingHours: jest.fn(() => true),
}));

import { isInTradingHours } from '@app/timezone';

function createController() {
  const config = {
    get: (key: string) =>
      key === 'OO_ALERT_RECEIVER_TOKEN' ? 'tok' : undefined,
  };
  const queue = { enqueue: jest.fn() };
  const timezone = { isTradingDay: jest.fn().mockResolvedValue(true) };
  const ctrl = new OoAlertReceiverController(
    config as never,
    queue as never,
    timezone as never,
  );
  return { ctrl, queue, timezone };
}

describe('OoAlertReceiverController', () => {
  beforeEach(() => {
    (isInTradingHours as jest.Mock).mockReturnValue(true);
  });

  it('rejects a missing token with 401', async () => {
    const { ctrl, queue } = createController();
    await expect(
      ctrl.receive(undefined, { alertName: 'A1', ts: '2026-08-13T02:00:00Z' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('drops the alert outside a trading session', async () => {
    const { ctrl, queue, timezone } = createController();
    timezone.isTradingDay.mockResolvedValue(false);
    const res = await ctrl.receive('tok', {
      alertName: 'A1',
      ts: '2026-08-13T02:00:00Z',
    });
    expect(res.accepted).toBe(false);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the alert during a trading session with derived severity', async () => {
    const { ctrl, queue } = createController();
    const res = await ctrl.receive('tok', {
      alertName: 'A1',
      ts: '2026-08-13T02:00:00Z',
    });
    expect(res.accepted).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ alertName: 'A1', severity: 'P0' }),
    );
  });

  it('defaults unknown alert names to P2 and missing ts to now', async () => {
    const { ctrl, queue } = createController();
    const res = await ctrl.receive('tok', { alertName: 'CUSTOM' });
    expect(res.accepted).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ alertName: 'CUSTOM', severity: 'P2' }),
    );
  });
});
