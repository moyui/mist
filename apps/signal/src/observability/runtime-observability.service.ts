import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PerformanceObserver } from 'node:perf_hooks';
import type { SignalHealthVo } from '../health/health.vo';

const SAMPLE_INTERVAL_MS = 5_000;

/** Process-local, low-cardinality runtime evidence. Health only reads snapshots. */
@Injectable()
export class RuntimeObservabilityService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly processStartedAt = new Date(
    Date.now() - process.uptime() * 1_000,
  ).toISOString();
  private heapUsedBytes = 0;
  private heapTotalBytes = 0;
  private rssBytes = 0;
  private heapHighWaterBytes = 0;
  private gcCount = 0;
  private gcPauseSeconds = 0;
  private consumerRemovalCount = 0;
  private tradingDayRolloverCount = 0;
  private lastCleanupOutcome: SignalHealthVo['runtime']['lastCleanupOutcome'] =
    null;
  private timer: NodeJS.Timeout | null = null;
  private observer: PerformanceObserver | null = null;

  constructor() {
    this.sampleMemory();
  }

  onApplicationBootstrap(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.gcCount += 1;
        this.gcPauseSeconds += entry.duration / 1_000;
      }
    });
    this.observer.observe({ entryTypes: ['gc'] });
    this.timer = setInterval(() => this.sampleMemory(), SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.observer?.disconnect();
    this.observer = null;
  }

  recordConsumerRemoval(removedCount: number): void {
    if (!Number.isSafeInteger(removedCount) || removedCount <= 0) return;
    this.consumerRemovalCount += removedCount;
    this.lastCleanupOutcome = 'consumer_removed';
  }

  recordTradingDayRollover(): void {
    this.tradingDayRolloverCount += 1;
    this.lastCleanupOutcome = 'trading_day_rolled_over';
  }

  snapshot(): SignalHealthVo['runtime'] {
    return {
      processStartedAt: this.processStartedAt,
      heapUsedBytes: this.heapUsedBytes,
      heapTotalBytes: this.heapTotalBytes,
      rssBytes: this.rssBytes,
      heapHighWaterBytes: this.heapHighWaterBytes,
      gcCount: this.gcCount,
      gcPauseSeconds: this.gcPauseSeconds,
      consumerRemovalCount: this.consumerRemovalCount,
      tradingDayRolloverCount: this.tradingDayRolloverCount,
      lastCleanupOutcome: this.lastCleanupOutcome,
    };
  }

  private sampleMemory(): void {
    const memory = process.memoryUsage();
    this.heapUsedBytes = memory.heapUsed;
    this.heapTotalBytes = memory.heapTotal;
    this.rssBytes = memory.rss;
    this.heapHighWaterBytes = Math.max(
      this.heapHighWaterBytes,
      memory.heapUsed,
    );
  }
}
