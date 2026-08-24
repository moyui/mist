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
  const queue = { enqueueAlert: jest.fn() };
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
    expect(queue.enqueueAlert).not.toHaveBeenCalled();
  });

  it('drops the alert outside a trading session', async () => {
    const { ctrl, queue, timezone } = createController();
    timezone.isTradingDay.mockResolvedValue(false);
    const res = await ctrl.receive('tok', {
      alertName: 'A1',
      ts: '2026-08-13T02:00:00Z',
    });
    expect(res.accepted).toBe(false);
    expect(queue.enqueueAlert).not.toHaveBeenCalled();
  });

  it('enqueues the alert during a trading session with derived severity', async () => {
    const { ctrl, queue } = createController();
    const res = await ctrl.receive('tok', {
      alertName: 'A1',
      ts: '2026-08-13T02:00:00Z',
    });
    expect(res.accepted).toBe(true);
    expect(queue.enqueueAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertName: 'A1', severity: 'P0' }),
    );
  });

  it('rejects a payload with a missing ts (L1 — no fabricated timestamp)', async () => {
    const { ctrl, queue } = createController();
    const res = await ctrl.receive('tok', { alertName: 'A1' });
    expect(res.accepted).toBe(false);
    expect(queue.enqueueAlert).not.toHaveBeenCalled();
  });

  it('defaults unknown alert names to P2', async () => {
    const { ctrl, queue } = createController();
    const res = await ctrl.receive('tok', {
      alertName: 'CUSTOM',
      ts: '2026-08-13T02:00:00Z',
    });
    expect(res.accepted).toBe(true);
    expect(queue.enqueueAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertName: 'CUSTOM', severity: 'P2' }),
    );
  });

  it('maps A8 alert to P1 and A9 alert to P2', async () => {
    const { ctrl, queue } = createController();
    await ctrl.receive('tok', {
      alertName: 'A8_post_close_sync_failed',
      ts: '2026-08-24T14:30:00Z',
    });
    expect(queue.enqueueAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertName: 'A8_post_close_sync_failed',
        severity: 'P1',
      }),
    );

    await ctrl.receive('tok', {
      alertName: 'A9_post_close_sync_unready_surge',
      ts: '2026-08-24T22:30:00Z',
    });
    expect(queue.enqueueAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertName: 'A9_post_close_sync_unready_surge',
        severity: 'P2',
      }),
    );
  });
});
