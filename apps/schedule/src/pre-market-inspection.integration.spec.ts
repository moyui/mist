import { PreMarketInspectionService } from './pre-market-inspection.service';
import { SecurityStatus } from '@app/shared-data';

describe('PreMarketInspectionService Local Simulation & Verification', () => {
  let qmtReconRequired = false;
  let qmtPhase = 'completed';
  let tdxReady = true;
  let signalOk = true;

  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockImplementation((url: string | URL | Request) => {
        const urlStr = url.toString();
        if (
          urlStr.includes('/backend/health') ||
          urlStr.includes(':8001/health')
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              instance: 'backend',
              productizationMode: 'on',
              strategyMode: 'on',
              redisAvailable: true,
              allowlistCount: 2,
            }),
          } as any);
        }
        if (urlStr.includes('/qmt/health')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              realtimeMode: 'builtin',
              bridge: { ready: true },
              subscriptions: {
                ready: !qmtReconRequired,
                journalHealthy: true,
                reconciliationRequired: qmtReconRequired,
                startupReconciliation: {
                  phase: qmtPhase,
                  unknownCount: qmtReconRequired ? 1 : 0,
                },
              },
            }),
          } as any);
        }
        if (urlStr.includes('/tdx/health')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              realtimeMode: 'builtin',
              bridge: { ready: tdxReady },
              subscriptions: { ready: tdxReady },
            }),
          } as any);
        }
        if (
          urlStr.includes('/signal/health') ||
          urlStr.includes('/signal') ||
          urlStr.includes(':8010/health')
        ) {
          return Promise.resolve({
            ok: signalOk,
            status: signalOk ? 200 : 503,
            json: async () => ({
              status: signalOk ? 'ok' : 'error',
              instance: 'signal',
              realtimeMode: 'on',
            }),
          } as any);
        }
        if (urlStr.includes('qyapi.weixin.qq.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ errcode: 0, errmsg: 'ok' }),
          } as any);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: 'not found' }),
        } as any);
      });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const createService = (kCount = 1, activeCount = 2) => {
    const kRepo: any = {
      count: jest.fn().mockResolvedValue(kCount),
    };
    const securityRepo: any = {
      query: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    const assignments = [];
    for (let i = 1; i <= activeCount; i++) {
      assignments.push({
        securityId: i,
        security: { id: i, status: SecurityStatus.ACTIVE },
        sourceConfig: { source: i % 2 === 1 ? 'tdx' : 'qmt' },
      });
    }
    const assignmentRepo: any = {
      find: jest.fn().mockResolvedValue(assignments),
    };
    const timezoneService: any = {
      getCurrentBeijingTime: () => new Date('2026-08-25T09:05:00+08:00'),
      formatDate: () => '2026-08-25',
      isTradingDay: async () => true,
    };
    const configService: any = {
      get: (key: string) => {
        if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9876/tdx';
        if (key === 'QMT_BASE_URL') return 'http://127.0.0.1:9876/qmt';
        if (key === 'BACKEND_HEALTH_URL')
          return 'http://127.0.0.1:9876/backend/health';
        if (key === 'SIGNAL_HEALTH_URL') return 'http://127.0.0.1:9876/signal';
        if (key === 'NOTIFICATION_WECHAT_WEBHOOK')
          return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=mock';
        return undefined;
      },
    };

    return new PreMarketInspectionService(
      kRepo,
      securityRepo,
      assignmentRepo,
      timezoneService,
      configService,
    );
  };

  it('Verifies Scenario 1: All Green - 全部系统健康就绪', async () => {
    qmtReconRequired = false;
    qmtPhase = 'completed';
    tdxReady = true;
    signalOk = true;

    const service = createService(1, 2);
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

    console.log('\n================ [场景 1：All Green 简报] ================');
    console.log(report.markdown);
    console.log('========================================================\n');
  });

  it('Verifies Scenario 2: QMT Journal 对账阻塞 (8-23 故障复现)', async () => {
    qmtReconRequired = true;
    qmtPhase = 'degraded';
    tdxReady = true;
    signalOk = true;

    const service = createService(1, 2);
    const report = await service.runInspection(
      new Date('2026-08-25T09:05:00+08:00'),
    );

    expect(report.overallStatus).toBe('FAILED');
    expect(report.dimensions.datasource.passed).toBe(false);
    expect(report.markdown).toContain('QMT Journal reconciliation required');
    expect(report.markdown).toContain('context-rebuild-observation.json');

    console.log(
      '\n================ [场景 2：QMT Journal 阻塞智能诊断] ================',
    );
    console.log(report.markdown);
    console.log('========================================================\n');
  });

  it('Verifies Scenario 3: 昨夜收盘 K 线缺失', async () => {
    qmtReconRequired = false;
    qmtPhase = 'completed';
    tdxReady = true;
    signalOk = true;

    // kCount = 0 (缺失), activeCount = 12
    const service = createService(0, 12);
    const report = await service.runInspection(
      new Date('2026-08-25T09:05:00+08:00'),
    );

    expect(report.overallStatus).toBe('FAILED');
    expect(report.dimensions.klines.passed).toBe(false);
    expect(report.dimensions.subscription.passed).toBe(true);
    expect(report.dimensions.subscription.summary).toContain('活跃订阅池');

    console.log(
      '\n================ [场景 3：昨夜收盘 K 线缺失] ================',
    );
    console.log(report.markdown);
    console.log('========================================================\n');
  });
});
