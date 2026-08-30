import { PreMarketInspectionService } from './pre-market-inspection.service';
import { SecurityStatus } from '@app/shared-data';

describe('PreMarketInspectionService', () => {
  let service: PreMarketInspectionService;
  let kRepo: { count: jest.Mock };
  let securityRepo: { query: jest.Mock };
  let assignmentRepo: { find: jest.Mock };
  let timezoneService: {
    getCurrentBeijingTime: jest.Mock;
    formatDate: jest.Mock;
    isTradingDay: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    kRepo = {
      count: jest.fn().mockResolvedValue(48), // Mock 48 bars for intraday
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
      ]),
    };
    timezoneService = {
      getCurrentBeijingTime: jest
        .fn()
        .mockReturnValue(new Date('2026-08-25T09:05:00+08:00')),
      formatDate: jest.fn().mockReturnValue('2026-08-25'),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
        if (key === 'QMT_BASE_URL') return 'http://127.0.0.1:9002';
        if (key === 'BACKEND_HEALTH_URL') return 'http://127.0.0.1:8001/health';
        if (key === 'SIGNAL_HEALTH_URL') return 'http://127.0.0.1:8010/health';
        if (key === 'NOTIFICATION_WECHAT_WEBHOOK')
          return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mock';
        return undefined;
      }),
    };

    service = new PreMarketInspectionService(
      kRepo as any,
      securityRepo as any,
      assignmentRepo as any,
      timezoneService as any,
      configService as any,
    );
  });

  it('runs complete 6-dimensional health check successfully (All Green)', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'ok',
                instance: 'backend',
                productizationMode: 'on',
                strategyMode: 'on',
                redisAvailable: true,
                allowlistCount: 4,
                autoReconcile: true,
              },
            }),
        });
      }
      if (url.includes(':9001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              realtimeMode: 'builtin',
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
              realtimeMode: 'builtin',
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
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
            }),
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
      expect(report.dimensions.pipelineSwitches.passed).toBe(true);
      expect(report.dimensions.datasource.passed).toBe(true);
      expect(report.dimensions.klines.passed).toBe(true);
      expect(report.dimensions.subscription.passed).toBe(true);
      expect(report.dimensions.realtime.passed).toBe(true);
      expect(report.dimensions.infrastructure.passed).toBe(true);
      expect(report.markdown).toContain('09:05 盘前系统体检通过 (All Green)');
      expect(report.markdown).toContain('backend=on | signal=on');
      expect(report.sentToWechat).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('detects Backend productization off and outputs remediation guide', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'ok',
                instance: 'backend',
                productizationMode: 'off',
                strategyMode: 'on',
                redisAvailable: true,
                allowlistCount: 4,
                autoReconcile: true,
              },
            }),
        });
      }
      if (url.includes(':9001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              realtimeMode: 'builtin',
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
              realtimeMode: 'builtin',
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
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
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
      expect(report.dimensions.pipelineSwitches.passed).toBe(false);
      expect(report.dimensions.pipelineSwitches.details).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Backend Candle 产品化开关处于 off'),
        ]),
      );
      expect(report.dimensions.pipelineSwitches.remediation).toEqual(
        expect.arrayContaining([
          expect.stringContaining('REALTIME_PRODUCTIZATION_MODE'),
        ]),
      );
      expect(report.markdown).toContain('09:05 盘前体检发现异常 (需立即介入)');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('detects QMT journal reconciliation blocking state and outputs remediation guide', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'ok',
                instance: 'backend',
                productizationMode: 'on',
                strategyMode: 'on',
                redisAvailable: true,
                allowlistCount: 4,
                autoReconcile: true,
              },
            }),
        });
      }
      if (url.includes(':9001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              realtimeMode: 'builtin',
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
              realtimeMode: 'builtin',
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
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
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
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'ok',
                instance: 'backend',
                productizationMode: 'on',
                strategyMode: 'on',
                redisAvailable: true,
                allowlistCount: 4,
                autoReconcile: true,
              },
            }),
        });
      }
      if (url.includes(':8010/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
            }),
        });
      }
      if (url.includes('health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              realtimeMode: 'builtin',
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
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                status: 'ok',
                instance: 'backend',
                productizationMode: 'on',
                strategyMode: 'on',
                redisAvailable: true,
                allowlistCount: 3,
                autoReconcile: true,
              },
            }),
        });
      }
      if (url.includes(':8010/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'ok',
            realtimeMode: 'builtin',
            bridge: { ready: true },
            subscriptions: {
              ready: true,
              journalHealthy: true,
              reconciliationRequired: false,
              startupReconciliation: { phase: 'completed' },
            },
          }),
      });
    }) as any;

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

  it('detects Backend autoReconcile disabled and outputs remediation guide', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes(':8001/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'backend',
              productizationMode: 'on',
              strategyMode: 'on',
              redisAvailable: true,
              allowlistCount: 4,
              autoReconcile: false,
            }),
        });
      }
      if (url.includes(':9001/health') || url.includes(':9002/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              realtimeMode: 'builtin',
              bridge: { ready: true },
              subscriptions: { ready: true },
            }),
        });
      }
      if (url.includes(':8010/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'ok',
              instance: 'signal',
              realtimeMode: 'on',
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
      expect(report.dimensions.pipelineSwitches.passed).toBe(false);
      expect(report.dimensions.pipelineSwitches.details).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Backend 订阅生命周期自动对账处于禁用状态'),
        ]),
      );
      expect(report.dimensions.pipelineSwitches.remediation).toEqual(
        expect.arrayContaining([
          expect.stringContaining('realtime_subscription_auto_reconcile'),
        ]),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('delivers Feishu rich-text post (not markdown) when feishu webhook configured', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
      if (key === 'QMT_BASE_URL') return 'http://127.0.0.1:9002';
      if (key === 'BACKEND_HEALTH_URL') return 'http://127.0.0.1:8001/health';
      if (key === 'SIGNAL_HEALTH_URL') return 'http://127.0.0.1:8010/health';
      if (key === 'NOTIFICATION_WECHAT_WEBHOOK')
        return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mock';
      if (key === 'OO_ALERT_FEISHU_WEBHOOK')
        return 'https://open.feishu.cn/open-apis/bot/v2/hook/mock';
      if (key === 'OO_ALERT_FEISHU_SECRET') return 's3cret';
      return undefined;
    });

    const originalFetch = global.fetch;
    let feishuBody: unknown;
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('open.feishu.cn')) {
          feishuBody = JSON.parse(String(init?.body));
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ StatusCode: 0 }),
          }) as unknown as Response;
        }
        if (String(url).includes('qyapi.weixin.qq.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ errcode: 0 }),
          }) as unknown as Response;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        }) as unknown as Response;
      }) as unknown as typeof fetch;

    try {
      const report = await service.runInspection(
        new Date('2026-08-25T09:05:00+08:00'),
      );
      expect(report.sentToFeishu).toBe(true);
      const body = feishuBody as Record<string, any>;
      // Feishu has no markdown msg_type; the report must be sent as post (rich text).
      expect(body.msg_type).toBe('post');
      const zhCn = body.content.post.zh_cn;
      expect(zhCn.title).toContain('盘前');
      expect(Array.isArray(zhCn.content)).toBe(true);
      expect(zhCn.content[0]).toEqual([
        expect.objectContaining({ tag: 'text' }),
      ]);
      expect(String(zhCn.content[0][0].text)).toContain('链路开关');
      // 第二个段落应为空行段落（标题行之间空行分隔）
      expect(zhCn.content[1]).toEqual([{ tag: 'text', text: '' }]);
      // no markdown symbols leaked into rich-text lines
      const allText = zhCn.content
        .map((row: any[]) => row.map((n: any) => n.text).join(''))
        .join('');
      expect(allText).not.toContain('**');
      expect(allText).not.toContain('###');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
