import { PreMarketInspectionService } from './pre-market-inspection.service';
import { SecurityStatus } from '@app/shared-data';

describe('PreMarketInspectionService', () => {
  let service: PreMarketInspectionService;
  let kRepo: any;
  let securityRepo: any;
  let assignmentRepo: any;
  let timezoneService: any;
  let configService: any;

  beforeEach(() => {
    kRepo = {
      count: jest.fn().mockResolvedValue(1),
    };
    securityRepo = {
      query: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    assignmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          securityId: 1,
          security: { id: 1, status: SecurityStatus.ACTIVE },
          sourceConfig: { source: 'tdx' },
        },
        {
          securityId: 2,
          security: { id: 2, status: SecurityStatus.ACTIVE },
          sourceConfig: { source: 'qmt' },
        },
      ]),
    };
    timezoneService = {
      getCurrentBeijingTime: jest
        .fn()
        .mockReturnValue(new Date('2026-08-25T09:05:00+08:00')),
      formatDate: jest.fn(() => '2026-08-25'),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'TDX_BASE_URL') return 'http://tdx-datasource:9001';
        if (key === 'QMT_BASE_URL') return 'http://qmt-datasource:9002';
        if (key === 'SIGNAL_HEALTH_URL') return 'http://signal:8010/health';
        if (key === 'NOTIFICATION_WECHAT_WEBHOOK')
          return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mock';
        return undefined;
      }),
    };

    service = new PreMarketInspectionService(
      kRepo,
      securityRepo,
      assignmentRepo,
      timezoneService,
      configService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes all dimensions when systems are green', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':9001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              bridge: { ready: true },
              subscriptions: { ready: true },
            }),
        });
      }
      if (url.includes(':9002/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              bridge: { ready: true },
              subscriptions: {
                ready: true,
                journalHealthy: true,
                reconciliationRequired: false,
                startupReconciliation: { phase: 'completed' },
              },
            }),
        });
      }
      if (url.includes(':8010/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'ok', instance: 'signal' }),
        });
      }
      if (url.includes('qyapi.weixin.qq.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ errcode: 0, errmsg: 'ok' }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as any;

    try {
      const report = await service.runInspection(
        new Date('2026-08-25T09:05:00+08:00'),
      );
      expect(report.overallStatus).toBe('PASSED');
      expect(report.dimensions.datasource.passed).toBe(true);
      expect(report.dimensions.klines.passed).toBe(true);
      expect(report.dimensions.subscription.passed).toBe(true);
      expect(report.dimensions.realtime.passed).toBe(true);
      expect(report.dimensions.infrastructure.passed).toBe(true);
      expect(report.markdown).toContain('09:05 盘前系统体检通过 (All Green)');
      expect(report.sentToWechat).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('detects QMT journal reconciliation blocking state and outputs remediation guide', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':9001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              bridge: { ready: true },
              subscriptions: { ready: true },
            }),
        });
      }
      if (url.includes(':9002/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              bridge: { ready: true },
              subscriptions: {
                ready: false,
                journalHealthy: true,
                reconciliationRequired: true,
                startupReconciliation: {
                  phase: 'degraded',
                  unknownCount: 1,
                },
              },
            }),
        });
      }
      if (url.includes(':8010/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'ok', instance: 'signal' }),
        });
      }
      if (url.includes('qyapi.weixin.qq.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ errcode: 0, errmsg: 'ok' }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as any;

    try {
      const report = await service.runInspection(
        new Date('2026-08-25T09:05:00+08:00'),
      );
      expect(report.overallStatus).toBe('FAILED');
      expect(report.dimensions.datasource.passed).toBe(false);
      expect(report.dimensions.datasource.details).toEqual(
        expect.arrayContaining([
          'QMT Journal reconciliation required (control plane locked)',
        ]),
      );
      expect(report.dimensions.datasource.remediation).toEqual(
        expect.arrayContaining([
          expect.stringContaining('context-rebuild-observation.json'),
        ]),
      );
      expect(report.markdown).toContain('09:05 盘前体检发现异常 (需立即介入)');
      expect(report.markdown).toContain('context-rebuild-observation.json');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('detects missing K-lines on previous trading day', async () => {
    kRepo.count.mockResolvedValue(0); // 0 K lines found

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              bridge: { ready: true },
              subscriptions: {
                ready: true,
                journalHealthy: true,
                reconciliationRequired: false,
                startupReconciliation: { phase: 'completed' },
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    try {
      const report = await service.runInspection(
        new Date('2026-08-25T09:05:00+08:00'),
      );
      expect(report.overallStatus).toBe('FAILED');
      expect(report.dimensions.klines.passed).toBe(false);
      expect(report.dimensions.klines.remediation).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('accurately reports active subscription pool statistics', async () => {
    assignmentRepo.find.mockResolvedValue([
      {
        securityId: 1,
        security: { id: 1, status: SecurityStatus.ACTIVE },
        sourceConfig: { source: 'tdx' },
      },
      {
        securityId: 2,
        security: { id: 2, status: SecurityStatus.ACTIVE },
        sourceConfig: { source: 'tdx' },
      },
      {
        securityId: 3,
        security: { id: 3, status: SecurityStatus.ACTIVE },
        sourceConfig: { source: 'qmt' },
      },
    ]);

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'ok',
            bridge: { ready: true },
            subscriptions: {
              ready: true,
              journalHealthy: true,
              reconciliationRequired: false,
              startupReconciliation: { phase: 'completed' },
            },
          }),
      }),
    ) as any;

    try {
      const report = await service.runInspection(
        new Date('2026-08-25T09:05:00+08:00'),
      );
      expect(report.dimensions.subscription.passed).toBe(true);
      expect(report.dimensions.subscription.summary).toContain(
        '活跃订阅池 (tdx: 2 标的, qmt: 1 标的)',
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
