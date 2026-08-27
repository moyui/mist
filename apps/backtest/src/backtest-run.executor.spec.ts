import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';
import { compileStoredStrategyRule, type StrategyBar } from '@app/strategy';
import { createChanFullOutputFixture } from '../../../libs/chancore/src/chan-full-output.characterization.fixture';
import type { ChanBspEvent } from '../../../libs/signal/src/runtime/chan-bsp/chan-bsp.types';
import { HealthStateService } from './health/health-state.service';
import { BacktestRunExecutor } from './backtest-run.executor';

// chan_bsp 用例聚焦回放链路（分派/完整信号流/防重复/门禁）——编译细节由
// chan-bsp.config 单测覆盖，这里 mock 一个窗口预算为 10 的 plan，避免
// 真实 window budget（30m=200 根）超出 characterization fixture（45 根）。
jest.mock('@app/signal', () => {
  const actual = jest.requireActual('@app/signal');
  return {
    ...actual,
    compileChanBspConfig: jest.fn(() => ({
      units: 'duan' as const,
      points: { first: true, second: true, third: true },
      direction: 'both' as const,
      requiredBarCount: 10,
    })),
  };
});

function run() {
  return {
    id: 41,
    strategyVersionId: 7,
    targetUniverse: ['600000.SH', 'MISSING.SH'],
    targetIssues: [],
    period: Period.DAY,
    source: DataSource.TDX,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-31T00:00:00.000Z'),
    status: BacktestRunStatus.PENDING,
    kind: 'rule_dsl',
  };
}

function executor(overrides: Record<string, unknown> = {}) {
  const current = run();
  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const dependencies = {
    runRepository: {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(current),
    },
    resultRepository: {
      insert: jest.fn(),
      create: jest.fn((input: object) => ({ id: 1, ...input })),
    },
    versionRepository: {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        rule: { field: 'k.close', operator: 'gt', value: 1 },
        signalKind: 'entry',
      }),
    },
    securityRepository: {
      find: jest.fn().mockResolvedValue([]),
    },
    definitionRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 3, periods: [1440] }),
    },
    marketData: {
      readReplayPage: jest.fn(),
      loadReplayWindow: jest.fn(),
    },
    dataSource,
    config: {
      get: jest.fn((key: string) =>
        key === 'BACKTEST_RUN_TIMEOUT_MS'
          ? 60_000
          : key === 'BACKTEST_MAX_BARS_PER_RUN'
            ? 10_000
            : undefined,
      ),
    },
    health: new HealthStateService(),
  };
  return {
    instance: (() => {
      const inst = new BacktestRunExecutor(
        dependencies.runRepository as any,
        dependencies.resultRepository as any,
        dependencies.versionRepository as any,
        dependencies.securityRepository as any,
        dependencies.definitionRepository as any,
        dependencies.marketData as any,
        dependencies.dataSource as any,
        dependencies.config as any,
        dependencies.health,
      );
      if ((overrides as any).chanBspDetector !== undefined) {
        (inst as any).chanBspDetector = (overrides as any).chanBspDetector;
      }
      return inst;
    })(),
    current,
    manager,
    dependencies,
    ...overrides,
  };
}

describe('BacktestRunExecutor', () => {
  it('persists all target issues in the same failure cleanup transaction', async () => {
    const fixture = executor();

    await fixture.instance.execute(fixture.current.id);

    expect(
      fixture.dependencies.marketData.readReplayPage,
    ).not.toHaveBeenCalled();
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledTimes(1);
    expect(fixture.dependencies.dataSource.transaction).toHaveBeenCalledTimes(
      1,
    );
    expect(fixture.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 41, status: expect.anything() }),
      expect.objectContaining({
        status: BacktestRunStatus.FAILED,
        errorMessage: 'BACKTEST_NO_EXECUTABLE_TARGETS',
        targetIssues: [
          { securityCode: '600000.SH', code: 'SECURITY_NOT_FOUND' },
          { securityCode: 'MISSING.SH', code: 'SECURITY_NOT_FOUND' },
        ],
      }),
    );
    expect(fixture.manager.delete).toHaveBeenCalledWith(expect.anything(), {
      backtestRunId: 41,
    });
  });

  it('uses the same cleanup boundary when the claim readback fails', async () => {
    const fixture = executor();
    fixture.dependencies.runRepository.findOne.mockResolvedValueOnce(null);

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.dataSource.transaction).toHaveBeenCalledTimes(
      1,
    );
    expect(fixture.manager.delete).toHaveBeenCalledWith(expect.anything(), {
      backtestRunId: 41,
    });
  });

  it('hydrates the initial window segment bidirectionally before streaming bars', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: { field: 'indicator.kdj.k', operator: 'gt', value: -1 },
      signalKind: 'entry',
    });
    // 12 bars before startDate; the leading one has a broken OHLC four-tuple and
    // must be back-filled from its later same-day anchor during hydration.
    const hydrated = Array.from({ length: 12 }, (_, index) =>
      strategyBar(
        `2026-08-04T01:${String(30 + index).padStart(2, '0')}:00.000Z`,
      ),
    );
    hydrated[0] = { ...hydrated[0], open: Number.NaN };
    const streaming = strategyBar('2026-08-04T01:42:00.000Z');
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: hydrated,
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [streaming],
      nextAfterTimestamp: null,
    });
    fixture.dependencies.resultRepository.create.mockImplementation(
      (input: object) => ({ id: 1, ...input }),
    );

    await fixture.instance.execute(fixture.current.id);

    // Two-phase contract: initial segment loaded with an exclusive endAt at startDate,
    // then the streaming page starts at startDate (replayStartFor, no quantity fields).
    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith({
      securityId: 9,
      source: 'tdx',
      period: Period.ONE_MIN,
      endAt: startDate,
      requiredBars: 13,
    });
    expect(fixture.dependencies.marketData.readReplayPage).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: startDate }),
    );
    // The back-filled leading bar keeps the KDJ window evaluable (no
    // field_unavailable), so the matched signal is recorded.
    expect(fixture.dependencies.resultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ signalTime: streaming.timestamp }),
    );
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, status: BacktestRunStatus.RUNNING }),
      expect.objectContaining({
        status: BacktestRunStatus.COMPLETED,
        signalCount: 1,
      }),
    );
  });

  it('allows a quantity-consuming plan to proceed to replay after HIL approval', async () => {
    // quantity profile HIL 已通过，量价 plan 现在可以正常 replay。
    const fixture = executor();
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: { field: 'k.volume', operator: 'gt', value: '0' },
      signalKind: 'entry',
    });
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [],
      nextAfterTimestamp: null,
    });

    await fixture.instance.execute(fixture.current.id);

    // 验证 plan 进入了 replay 阶段（gate 已移除）
    expect(fixture.dependencies.marketData.loadReplayWindow).toHaveBeenCalled();
  });

  it('bounds the hydration window at the replay start so a quantity plan never overlaps the streaming page', async () => {
    // F1 回归：消费量价的分钟级 plan，replayStartFor 回到当日开盘（08-04T01:30Z = 上海
    // 09:30）；盘中 startDate（01:42Z）时 initial 窗口必须以 replayStart 为界，否则与
    // page 重叠（append 抛 strictly increasing RangeError）。
    // 注：量价 plan 现在可以正常 replay（quantity profile HIL 已通过）。
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const dayOpen = new Date('2026-08-04T01:30:00.000Z');
    const fixture = executor();
    const run = {
      ...fixture.current,
      period: Period.ONE_MIN,
      startDate,
      targetUniverse: ['600000.SH'],
    };
    const rule = { field: 'k.volume', operator: 'gt', value: '0' };
    const plan = compileStoredStrategyRule(rule, 'entry');
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });
    const budget = {
      consume: jest.fn(),
      checkpoint: jest.fn(),
      checkDeadline: jest.fn(),
    };

    await (fixture.instance as any).replaySecurity(
      run,
      { kind: 'rule_dsl', plan },
      rule,
      '600000.SH',
      9,
      [],
      new Set<string>(),
      budget,
      () => {},
    );

    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: 9,
        source: 'tdx',
        period: Period.ONE_MIN,
        endAt: dayOpen, // 以 replayStart（当日开盘）为界，而非 startDate
      }),
    );
    expect(fixture.dependencies.marketData.readReplayPage).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: dayOpen }),
    );
  });

  it('keeps evaluations insufficient until the hydrated window plus appends fill the plan', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: { field: 'indicator.kdj.k', operator: 'gt', value: -1 },
      signalKind: 'entry',
    });
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });
    fixture.dependencies.resultRepository.create.mockImplementation(
      (input: object) => ({ id: 1, ...input }),
    );

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).not.toHaveBeenCalled();
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, status: BacktestRunStatus.RUNNING }),
      expect.objectContaining({
        status: BacktestRunStatus.COMPLETED,
        signalCount: 0,
      }),
    );
  });

  it('counts hydrated bars against the replay budget', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: { field: 'k.close', operator: 'gt', value: 1 },
      signalKind: 'entry',
    });
    (fixture.dependencies.config.get as jest.Mock).mockImplementation(
      (key: string) =>
        key === 'BACKTEST_RUN_TIMEOUT_MS'
          ? 60_000
          : key === 'BACKTEST_MAX_BARS_PER_RUN'
            ? 1
            : undefined,
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [
        strategyBar('2026-08-04T01:30:00.000Z'),
        strategyBar('2026-08-04T01:31:00.000Z'),
      ],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 41, status: expect.anything() }),
      expect.objectContaining({
        status: BacktestRunStatus.FAILED,
        errorMessage: 'BACKTEST_BAR_LIMIT_EXCEEDED',
      }),
    );
  });
});

function strategyBar(timestamp: string): StrategyBar {
  const close = 10.5;
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(timestamp),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: '100',
    amount: '200',
    type: 'complete',
  };
}

function completedUpdateCall(fixture: {
  dependencies: { runRepository: { update: { mock: { calls: unknown[][] } } } };
}): Record<string, unknown> {
  const calls = fixture.dependencies.runRepository.update.mock.calls;
  const completed = calls.find(
    (call) =>
      ((call[1] as Record<string, unknown>).status as string) ===
      BacktestRunStatus.COMPLETED,
  );
  return (completed?.[1] as Record<string, unknown>) ?? {};
}

describe('BacktestRunExecutor chan_bsp replay', () => {
  const FIRST_BUY: ChanBspEvent = {
    type: 'first_buy',
    units: 'duan',
    time: new Date('2024-02-05T16:00:00.000Z'),
    price: 1571.61,
    zhongshuIndex: 1,
    zg: 1630.0,
    zd: 1560.0,
    unitIndex: 14,
  };
  const SECOND_BUY: ChanBspEvent = {
    type: 'second_buy',
    units: 'duan',
    time: new Date('2024-02-12T16:00:00.000Z'),
    price: 1564.61,
    zhongshuIndex: null,
    zg: null,
    zd: null,
    unitIndex: 21,
  };

  function chanBspFixture(events: readonly ChanBspEvent[] = [FIRST_BUY]) {
    const detector = { evaluate: jest.fn().mockReturnValue(events) };
    const fixture = executor({ chanBspDetector: detector } as any);
    const chanRun = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: 30,
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2025-01-31T00:00:00.000Z'),
      kind: 'chan_bsp',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(chanRun);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: {
        units: 'duan',
        direction: 'both',
        points: { first: true, second: true, third: true },
      },
      signalKind: 'entry',
    });
    fixture.dependencies.definitionRepository.findOne.mockResolvedValue({
      id: 3,
      periods: [30],
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', type: 'STOCK', status: 1 } as any,
    ]);
    return fixture;
  }

  function chanBspBars(): StrategyBar[] {
    return createChanFullOutputFixture().map((k, index) => ({
      securityId: 9,
      source: 'tdx',
      period: 30,
      timestamp: new Date(k.time),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: index % 7 === 0 ? '0' : '1000', // 含 0 异常量价，矫正层应消化
      amount: String(Number(k.amount)), // fixture 尾零小数非 canonical，规范化为整数/去尾零
      type: 'complete',
    }));
  }

  it('persists each fresh point exactly once over the corrected window (complete signal flow)', async () => {
    const fixture = chanBspFixture([FIRST_BUY, SECOND_BUY]);
    const bars = chanBspBars();
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    // 两页：stub detector 每根评估都返回同样的已确认点 —— cursor 记账必须
    // 只 emit 第一次（unitIndex 单调），两页后结果行仍为 2 且各 signalTime 真实。
    fixture.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: bars.slice(0, 24),
        nextAfterTimestamp: new Date(bars[23].timestamp.getTime()),
      })
      .mockResolvedValueOnce({
        bars: bars.slice(24),
        nextAfterTimestamp: undefined,
      });

    await fixture.instance.execute(fixture.current.id);

    const fixtureCalls = fixture.dependencies.resultRepository.create.mock
      .calls as [Record<string, unknown>][];
    expect(fixtureCalls.length).toBe(2); // 防重复：两页同点只 emit 一次
    expect(fixtureCalls[0][0].signalTime).toEqual(FIRST_BUY.time);
    expect(fixtureCalls[1][0].signalTime).toEqual(SECOND_BUY.time);
    expect((fixtureCalls[0][0].contextSnapshot as any).chanBsp).toEqual({
      type: 'first_buy',
      units: 'duan',
      level: 30,
      zhongshuIndex: 1,
      zg: 1630.0,
      zd: 1560.0,
    });
    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.signalCount).toBe(1); // 触发语义：同次评估多点计 1 次
    expect(completedUpdate.matchedSecurityCount).toBe(1);
    // 矫正层输入契约：stub detector 收到的是 imputer 的 ProjectedStrategyBar 视图。
    const fedWindow = (fixture.dependencies as any).__chanBspDetector
      ? undefined
      : (fixture.instance as any).chanBspDetector.evaluate.mock.calls[0][0];
    expect(Array.isArray(fedWindow)).toBe(true);
    expect(fedWindow[0]).toEqual(
      expect.objectContaining({
        rawBar: expect.anything(),
        ohlc: expect.anything(),
      }),
    );
  });

  it('replays chan_bsp with zero and null quantities', async () => {
    const fixture = chanBspFixture([]);
    const bars = chanBspBars().map((bar, index) =>
      index % 5 === 0 ? { ...bar, volume: null, amount: null } : bar,
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars,
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.status).toBe(BacktestRunStatus.COMPLETED);
  });

  it('is honest with a real detector when the structure confirms no point', async () => {
    // 真实 ChanBspDetector（不经 mock 编译路径）：45 根日线不足段级结构 → 空结果，
    // run 仍 COMPLETED、0 信号（结构不足是常态空结果，非错误）。
    const fixture = executor({ chanBspDetector: undefined } as any);
    const chanRun = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: 30,
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2025-01-31T00:00:00.000Z'),
      kind: 'chan_bsp',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(chanRun);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      rule: {
        units: 'duan',
        direction: 'both',
        points: { first: true, second: true, third: true },
      },
      signalKind: 'entry',
    });
    fixture.dependencies.definitionRepository.findOne.mockResolvedValue({
      id: 3,
      periods: [30],
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', type: 'STOCK', status: 1 } as any,
    ]);
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: chanBspBars(),
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).not.toHaveBeenCalled();
    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.signalCount).toBe(0);
    expect(completedUpdate.matchedSecurityCount).toBe(0);
  });

  it('fails fast when a chan_bsp run carries an unsupported period', async () => {
    const fixture = chanBspFixture([]);
    fixture.dependencies.runRepository.findOne.mockResolvedValue({
      ...fixture.current,
      kind: 'chan_bsp',
      period: 1440,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 41, status: expect.anything() }),
      expect.objectContaining({
        status: BacktestRunStatus.FAILED,
        errorMessage: 'BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED',
      }),
    );
  });
});
