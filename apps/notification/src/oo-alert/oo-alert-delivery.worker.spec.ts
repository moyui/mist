import { OoAlertDeliveryWorker } from './oo-alert-delivery.worker';
import { buildInfraEnvelope } from './infra-alert.envelope';
import { SEVERITY_BY_PREFIX } from './oo-alert.constants';

function createWorker(channels = 'wechat') {
  const config = {
    get: (key: string) =>
      key === 'NOTIFICATION_CHANNELS' ? channels : undefined,
  };
  const wecom = { channel: 'WECHAT', send: jest.fn() };
  const qq = { channel: 'QQ', send: jest.fn() };
  const counters = {
    recordSent: jest.fn(),
    recordFailure: jest.fn(),
  };
  const worker = new OoAlertDeliveryWorker(
    config as never,
    wecom as never,
    qq as never,
    counters as never,
  );
  return { worker, wecom, qq, counters };
}

const JOB = {
  alertName: 'A1',
  severity: 'P0' as const,
  ts: '2026-08-13T02:00:00Z',
  summary: 'snapshot stalled',
  source: 'tdx',
};

describe('buildInfraEnvelope', () => {
  it('builds a channel-neutral text with source', () => {
    expect(buildInfraEnvelope(JOB)).toEqual({
      text: '[Mist 告警][P0] A1 source=tdx\nsnapshot stalled\n2026-08-13T02:00:00Z',
    });
  });
});

describe('OoAlertDeliveryWorker', () => {
  it('sends WeCom only when QQ is disabled', async () => {
    const { worker, wecom, qq, counters } = createWorker('wechat');
    wecom.send.mockResolvedValue({ status: 'sent' });
    await worker.process({ data: JOB } as never);
    expect(wecom.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('[Mist 告警][P0] A1'),
      }),
    );
    expect(qq.send).not.toHaveBeenCalled();
    expect(counters.recordSent).toHaveBeenCalledWith('WECHAT');
  });

  it('sends QQ as well when enabled', async () => {
    const { worker, wecom, qq } = createWorker('wechat,qq');
    wecom.send.mockResolvedValue({ status: 'sent' });
    qq.send.mockResolvedValue({ status: 'sent' });
    await worker.process({ data: JOB } as never);
    expect(qq.send).toHaveBeenCalledTimes(1);
  });

  it('throws on transient failure so BullMQ retries', async () => {
    const { worker, wecom } = createWorker();
    wecom.send.mockResolvedValue({
      status: 'transient_failure',
      error: 'boom',
    });
    await expect(worker.process({ data: JOB } as never)).rejects.toThrow(
      'boom',
    );
  });

  it('counts permanent failure without throwing', async () => {
    const { worker, wecom, counters } = createWorker();
    wecom.send.mockResolvedValue({ status: 'permanent_failure', error: 'bad' });
    await worker.process({ data: JOB } as never);
    expect(counters.recordFailure).toHaveBeenCalledWith('WECHAT');
  });
});

describe('SEVERITY_BY_PREFIX', () => {
  it('covers every rules.json prefix (A1..A6) — L4 contract lock', () => {
    // Must stay in lockstep with mist-deploy/oo-alerts/rules.json; the sync
    // script enforces the same mapping on the deploy side.
    expect(SEVERITY_BY_PREFIX).toEqual({
      A1: 'P0',
      A2: 'P0',
      A3: 'P1',
      A4: 'P1',
      A5: 'P2',
      A6: 'P2',
    });
  });
});
