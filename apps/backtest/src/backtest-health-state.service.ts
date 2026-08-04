import { Injectable } from '@nestjs/common';
import type { BacktestHealthVo } from './backtest-health.vo';

@Injectable()
export class BacktestHealthStateService {
  private state: BacktestHealthVo['backtest']['state'] = 'starting';
  private activeCount = 0;
  private waitingCount = 0;
  private concurrency = 2;
  private queueCapacity = 8;
  private commandAcceptedCount = 0;
  private commandQueueFullCount = 0;
  private commandNotReadyCount = 0;
  private commandRunFailedCount = 0;
  private startupQueueFullCount = 0;
  private startupUnavailableCount = 0;
  private runCompletedCount = 0;
  private runFailedCount = 0;
  private resultBatchCount = 0;
  private resultRowCount = 0;
  private resultBatchFailureCount = 0;
  private lastRunDurationSeconds: number | null = null;
  private lastResultBatchDurationSeconds: number | null = null;
  private lastFailureClass: string | null = null;
  private oldestActiveStartedAtMs: number | null = null;
  private oldestWaitingEnqueuedAtMs: number | null = null;

  configure(concurrency: number, queueCapacity: number): void {
    this.concurrency = concurrency;
    this.queueCapacity = queueCapacity;
  }

  setReady(ready: boolean): void {
    this.state = ready ? 'ready' : 'error';
  }

  setCounts(
    activeCount: number,
    waitingCount: number,
    oldestActiveStartedAtMs: number | null = null,
    oldestWaitingEnqueuedAtMs: number | null = null,
  ): void {
    this.activeCount = activeCount;
    this.waitingCount = waitingCount;
    this.oldestActiveStartedAtMs = oldestActiveStartedAtMs;
    this.oldestWaitingEnqueuedAtMs = oldestWaitingEnqueuedAtMs;
  }

  recordCommand(
    outcome: 'accepted' | 'queue_full' | 'not_ready' | 'run_failed',
  ): void {
    if (outcome === 'accepted') this.commandAcceptedCount += 1;
    if (outcome === 'queue_full') this.commandQueueFullCount += 1;
    if (outcome === 'not_ready') this.commandNotReadyCount += 1;
    if (outcome === 'run_failed') this.commandRunFailedCount += 1;
  }

  recordStartupFailure(kind: 'queue_full' | 'unavailable', count = 1): void {
    const boundedCount = Number.isSafeInteger(count) && count > 0 ? count : 1;
    if (kind === 'queue_full') this.startupQueueFullCount += boundedCount;
    if (kind === 'unavailable') this.startupUnavailableCount += boundedCount;
  }

  recordRunCompleted(durationMs: number): void {
    this.runCompletedCount += 1;
    this.lastRunDurationSeconds = toSeconds(durationMs);
  }

  recordRunFailed(code: string, durationMs: number): void {
    this.runFailedCount += 1;
    this.lastRunDurationSeconds = toSeconds(durationMs);
    this.lastFailureClass = safeFailureClass(code);
  }

  recordResultBatch(rowCount: number, durationMs: number): void {
    this.resultBatchCount += 1;
    this.resultRowCount += rowCount;
    this.lastResultBatchDurationSeconds = toSeconds(durationMs);
  }

  recordResultBatchFailure(durationMs: number): void {
    this.resultBatchFailureCount += 1;
    this.lastResultBatchDurationSeconds = toSeconds(durationMs);
    this.lastFailureClass = 'BACKTEST_DATABASE_ERROR';
  }

  snapshot(): BacktestHealthVo {
    return {
      status: 'ok',
      service: 'backtest',
      backtest: {
        ready: this.state === 'ready',
        state: this.state,
        activeCount: this.activeCount,
        waitingCount: this.waitingCount,
        concurrency: this.concurrency,
        queueCapacity: this.queueCapacity,
        observations: {
          commandAcceptedCount: this.commandAcceptedCount,
          commandQueueFullCount: this.commandQueueFullCount,
          commandNotReadyCount: this.commandNotReadyCount,
          commandRunFailedCount: this.commandRunFailedCount,
          startupQueueFullCount: this.startupQueueFullCount,
          startupUnavailableCount: this.startupUnavailableCount,
          runCompletedCount: this.runCompletedCount,
          runFailedCount: this.runFailedCount,
          resultBatchCount: this.resultBatchCount,
          resultRowCount: this.resultRowCount,
          resultBatchFailureCount: this.resultBatchFailureCount,
          lastRunDurationSeconds: this.lastRunDurationSeconds,
          lastResultBatchDurationSeconds: this.lastResultBatchDurationSeconds,
          oldestActiveAgeSeconds: ageSeconds(this.oldestActiveStartedAtMs),
          oldestWaitingAgeSeconds: ageSeconds(this.oldestWaitingEnqueuedAtMs),
          lastFailureClass: this.lastFailureClass,
        },
      },
    };
  }
}

const SAFE_FAILURE_CLASSES = new Set([
  'BACKTEST_SOURCE_UNSUPPORTED',
  'BACKTEST_TARGET_UNIVERSE_EMPTY',
  'BACKTEST_NO_EXECUTABLE_TARGETS',
  'BACKTEST_DATABASE_ERROR',
  'BACKTEST_EXECUTION_TIMEOUT',
  'BACKTEST_BAR_LIMIT_EXCEEDED',
  'BACKTEST_QUANTITY_PROFILE_UNAVAILABLE',
  'BACKTEST_EXECUTION_FAILED',
  'BACKTEST_INTERRUPTED',
  'BACKTEST_STARTUP_QUEUE_FULL',
  'BACKTEST_STARTUP_UNAVAILABLE',
]);

function safeFailureClass(value: string): string {
  return SAFE_FAILURE_CLASSES.has(value) ? value : 'BACKTEST_EXECUTION_FAILED';
}

function toSeconds(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs >= 0
    ? durationMs / 1_000
    : 0;
}

function ageSeconds(startedAtMs: number | null): number | null {
  if (startedAtMs === null) return null;
  return toSeconds(Math.max(0, Date.now() - startedAtMs));
}
