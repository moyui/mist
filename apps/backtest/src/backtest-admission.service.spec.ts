import { BacktestAdmissionService } from './backtest-admission.service';
import { BacktestHealthStateService } from './backtest-health-state.service';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function config(values: Record<string, number>) {
  return { get: (name: string) => values[name] };
}

function runs(status: string = 'pending') {
  return {
    findOne: jest.fn().mockResolvedValue({ status }),
  };
}

describe('BacktestAdmissionService', () => {
  it('rejects before readiness and does not call the executor', async () => {
    const health = new BacktestHealthStateService();
    const executor = { execute: jest.fn() };
    const admission = new BacktestAdmissionService(
      config({ BACKTEST_CONCURRENCY: 1, BACKTEST_QUEUE_CAPACITY: 1 }) as any,
      executor as any,
      health,
      runs() as any,
    );

    await expect(admission.accept(1)).resolves.toEqual({
      accepted: false,
      code: 'not_ready',
    });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(health.snapshot().backtest.state).toBe('starting');
  });

  it('deduplicates active and waiting runs before applying capacity', async () => {
    const first = deferred();
    const health = new BacktestHealthStateService();
    const executor = { execute: jest.fn().mockReturnValue(first.promise) };
    const admission = new BacktestAdmissionService(
      config({ BACKTEST_CONCURRENCY: 1, BACKTEST_QUEUE_CAPACITY: 1 }) as any,
      executor as any,
      health,
      runs() as any,
    );
    admission.setReady(true);

    await expect(admission.accept(1)).resolves.toEqual({ accepted: true });
    await expect(admission.accept(2)).resolves.toEqual({ accepted: true });
    await expect(admission.accept(2)).resolves.toEqual({ accepted: true });
    await expect(admission.accept(3)).resolves.toEqual({
      accepted: false,
      code: 'queue_full',
    });
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(admission.activeCount()).toBe(1);
    expect(admission.waitingCount()).toBe(1);
    expect(health.snapshot().backtest.waitingCount).toBe(1);

    first.resolve();
  });

  it('promotes the oldest waiting run exactly once when a slot closes', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const health = new BacktestHealthStateService();
    const executor = {
      execute: jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockReturnValueOnce(third.promise),
    };
    const admission = new BacktestAdmissionService(
      config({ BACKTEST_CONCURRENCY: 1, BACKTEST_QUEUE_CAPACITY: 2 }) as any,
      executor as any,
      health,
      runs() as any,
    );
    admission.setReady(true);

    await admission.accept(10);
    await admission.accept(20);
    await admission.accept(30);
    first.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(executor.execute).toHaveBeenNthCalledWith(2, 20);
    expect(admission.activeCount()).toBe(1);
    expect(admission.waitingCount()).toBe(1);

    second.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(executor.execute).toHaveBeenNthCalledWith(3, 30);
    expect(admission.waitingCount()).toBe(0);

    third.resolve();
    await Promise.resolve();
  });

  it('returns run_failed for a durable failed run without reserving capacity', async () => {
    const health = new BacktestHealthStateService();
    const executor = { execute: jest.fn() };
    const admission = new BacktestAdmissionService(
      config({ BACKTEST_CONCURRENCY: 1, BACKTEST_QUEUE_CAPACITY: 1 }) as any,
      executor as any,
      health,
      runs('failed') as any,
    );
    admission.setReady(true);

    await expect(admission.accept(9)).resolves.toEqual({
      accepted: false,
      code: 'run_failed',
    });
    expect(admission.activeCount()).toBe(0);
    expect(admission.waitingCount()).toBe(0);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('keeps startup reservations unpublished until readiness is opened', () => {
    const health = new BacktestHealthStateService();
    const executor = { execute: jest.fn().mockResolvedValue(undefined) };
    const admission = new BacktestAdmissionService(
      config({ BACKTEST_CONCURRENCY: 1, BACKTEST_QUEUE_CAPACITY: 1 }) as any,
      executor as any,
      health,
      runs() as any,
    );

    const startNow = admission.restorePending([11]);
    expect(startNow).toEqual([11]);
    expect(executor.execute).not.toHaveBeenCalled();
    admission.setReady(true);
    admission.startReserved(startNow);
    expect(executor.execute).toHaveBeenCalledWith(11);
  });
});
