import { OoAlertQueueService } from './oo-alert-queue.service';
import { Queue } from 'bullmq';

jest.mock('bullmq');

describe('OoAlertQueueService', () => {
  let service: OoAlertQueueService;
  let mockQueue: { add: jest.Mock; getJobCounts: jest.Mock; close: jest.Mock };

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 1, active: 0, delayed: 0 }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (Queue as unknown as jest.Mock).mockImplementation(() => mockQueue);

    const config = {
      get: (key: string) =>
        key === 'MIST_REALTIME_REDIS_URL'
          ? 'redis://127.0.0.1:6379'
          : undefined,
    };
    service = new OoAlertQueueService(config as never);
  });

  it('enqueues an alert with a colon-free deterministic jobId', async () => {
    await service.enqueueAlert({
      alertName: 'A1_tdx_data_flow_stalled',
      severity: 'P0',
      ts: '2026-08-28T09:05:30.000Z',
      summary: 'TDX stalled',
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOptions] = mockQueue.add.mock.calls[0];
    expect(jobName).toBe('oo_alert');
    expect(jobData.alertName).toBe('A1_tdx_data_flow_stalled');
    expect(jobOptions.jobId).not.toContain(':');
    expect(jobOptions.jobId).toMatch(/^A1_tdx_data_flow_stalled-\d+$/);
  });
});
