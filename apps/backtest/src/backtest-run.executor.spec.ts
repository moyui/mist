import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';
import { compileStoredStrategyRule, type StrategyBar } from '@app/strategy';
import { BacktestHealthStateService } from './backtest-health-state.service';
import { BacktestRunExecutor } from './backtest-run.executor';

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
    resultRepository: { insert: jest.fn(), create: jest.fn() },
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
    health: new BacktestHealthStateService(),
  };
  return {
    instance: new BacktestRunExecutor(
      dependencies.runRepository as any,
      dependencies.resultRepository as any,
      dependencies.versionRepository as any,
      dependencies.securityRepository as any,
      dependencies.marketData as any,
      dependencies.dataSource as any,
      dependencies.config as any,
      dependencies.health,
    ),
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
      (input: unknown) => input,
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

  it('bounds the hydration window at the replay start so a quantity plan never overlaps the streaming page', async () => {
    // F1 回归：消费量价的分钟级 plan，replayStartFor 回到当日开盘（08-04T01:30Z = 上海
    // 09:30）；盘中 startDate（01:42Z）时 initial 窗口必须以 replayStart 为界，否则与
    // page 重叠（append 抛 strictly increasing RangeError）。
    // 注：量价 plan 在 replay() 被 BACKTEST_QUANTITY_PROFILE_UNAVAILABLE 门禁挡住
    // （quantity profile 未证明前 ineligible），此处直接驱动 replaySecurity 验证窗口衔接。
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
      plan,
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
      (input: unknown) => input,
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
