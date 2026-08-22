import { BacktestRunStatus, DataSource, Period } from '@app/shared-data';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BacktestRpcTransportError,
  type BacktestRpcClient,
} from '../runtime/backtest-rpc.client';
import {
  BacktestCommandHttpException,
  BacktestRunCommandService,
} from './backtest-run-command.service';

function dto() {
  return {
    strategyVersionId: 7,
    targetUniverse: ['600000.SH'],
    period: Period.DAY,
    source: DataSource.TDX as const,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T00:00:00.000Z',
  };
}

function fixture() {
  const run = { id: 41 };
  const version = { id: 7, strategyDefinitionId: 3 };
  const runRepository = {
    create: jest.fn().mockReturnValue(run),
    save: jest.fn().mockResolvedValue(run),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn(),
  };
  const rpc = { submit: jest.fn() };
  const definitionRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: 3, kind: 'rule_dsl', periods: [1440] }),
  };
  const service = new BacktestRunCommandService(
    { findOne: jest.fn().mockResolvedValue(version) } as any,
    runRepository as any,
    rpc as unknown as BacktestRpcClient,
    { getRequestId: jest.fn().mockReturnValue('http-test-1') } as any,
    { compileStoredVersion: jest.fn().mockReturnValue({ fields: [] }) } as any,
    definitionRepository as any,
  );
  return { service, runRepository, rpc, run, definitionRepository, version };
}

describe('BacktestRunCommandService handoff boundaries', () => {
  it('returns 429 with confirmed FAILED status after queue rejection', async () => {
    const f = fixture();
    f.rpc.submit.mockResolvedValue({
      ok: false,
      error: { code: 'queue_full' },
    });

    const error = await f.service
      .createRun(dto())
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(BacktestCommandHttpException);
    expect((error as BacktestCommandHttpException).getStatus()).toBe(429);
    expect((error as BacktestCommandHttpException).getResponse()).toMatchObject(
      {
        code: 'BACKTEST_QUEUE_FULL',
        data: { runId: 41, status: BacktestRunStatus.FAILED },
      },
    );
  });

  it('returns 504 only when timeout cleanup actually changed PENDING to FAILED', async () => {
    const f = fixture();
    f.rpc.submit.mockRejectedValue(new BacktestRpcTransportError('timeout'));

    const error = await f.service
      .createRun(dto())
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(BacktestCommandHttpException);
    expect((error as BacktestCommandHttpException).getStatus()).toBe(504);
    expect((error as BacktestCommandHttpException).getResponse()).toMatchObject(
      {
        code: 'BACKTEST_COMMAND_TIMEOUT',
        data: { runId: 41, status: BacktestRunStatus.FAILED },
      },
    );
  });

  it('returns the accepted receipt when timeout readback proves the run progressed', async () => {
    const f = fixture();
    f.rpc.submit.mockRejectedValue(new BacktestRpcTransportError('timeout'));
    f.runRepository.update.mockResolvedValue({ affected: 0 });
    f.runRepository.findOne.mockResolvedValue({
      id: 41,
      status: BacktestRunStatus.RUNNING,
    });

    await expect(f.service.createRun(dto())).resolves.toEqual({
      runId: 41,
      initialStatus: 'PENDING',
    });
    expect(f.runRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it('keeps RPC internal errors distinct from transport-unavailable mappings', async () => {
    const f = fixture();
    f.rpc.submit.mockRejectedValue(new BacktestRpcTransportError('failed'));

    const error = await f.service
      .createRun(dto())
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(BacktestCommandHttpException);
    expect((error as BacktestCommandHttpException).getStatus()).toBe(500);
    expect((error as BacktestCommandHttpException).getResponse()).toMatchObject(
      {
        code: 'INTERNAL_ERROR',
        data: { runId: 41, status: BacktestRunStatus.FAILED },
      },
    );
    expect(f.runRepository.update).toHaveBeenCalledWith(
      { id: 41, status: BacktestRunStatus.PENDING },
      expect.objectContaining({ errorMessage: 'BACKTEST_RPC_INTERNAL_ERROR' }),
    );
  });
});

describe('BacktestRunCommandService chan_bsp dispatch', () => {
  function chanBspFixture() {
    const f = fixture();
    const chanVersion = {
      id: 7,
      strategyDefinitionId: 3,
      rule: { units: 'bi', direction: 'both', points: { first: true } },
      ruleSchemaVersion: 'v1',
      signalKind: 'entry',
    };
    (f.service as any).versionRepository.findOne.mockResolvedValue(chanVersion);
    f.definitionRepository.findOne.mockResolvedValue({
      id: 3,
      kind: 'chan_bsp',
      periods: [30],
    });
    return f;
  }

  it('creates a chan_bsp run with the kind snapshot and skips the DSL gate', async () => {
    const f = chanBspFixture();
    f.rpc.submit.mockResolvedValue({ ok: true });

    const result = await f.service.createRun({
      ...dto(),
      period: 30,
    });

    expect(f.runRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chan_bsp' }),
    );
    expect(f.rpc.submit).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({ runId: 41, initialStatus: 'PENDING' }),
    );
  });

  it('rejects a chan_bsp run with an unsupported period before persisting', async () => {
    const f = chanBspFixture();

    await expect(f.service.createRun({ ...dto(), period: Period.DAY })).rejects
      .toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'CHAN_BSP_PERIOD_UNSUPPORTED',
          }),
        }),
      );

    expect(f.runRepository.save).not.toHaveBeenCalled();
  });

  it('maps an invalid chan_bsp rule to a 400 before persisting', async () => {
    const f = chanBspFixture();
    (f.service as any).versionRepository.findOne.mockResolvedValue({
      id: 7,
      strategyDefinitionId: 3,
      rule: { units: 'invalid', direction: 'both', points: { first: true } },
    });

    await expect(f.service.createRun({ ...dto(), period: 30 })).rejects.toThrow(
      BadRequestException,
    );

    expect(f.runRepository.save).not.toHaveBeenCalled();
  });

  it('rejects when the strategy definition is missing', async () => {
    const f = chanBspFixture();
    f.definitionRepository.findOne.mockResolvedValue(null);

    await expect(f.service.createRun({ ...dto(), period: 30 })).rejects.toThrow(
      NotFoundException,
    );

    expect(f.runRepository.save).not.toHaveBeenCalled();
  });
});
