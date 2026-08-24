import { Injectable, OnModuleInit } from '@nestjs/common';
import { metrics, Counter, Histogram } from '@opentelemetry/api';
import { DataSource, Period } from '@app/shared-data';

@Injectable()
export class PostCloseSyncMetrics implements OnModuleInit {
  private tasksCounter?: Counter;
  private klinesSavedCounter?: Counter;
  private durationHistogram?: Histogram;
  private lastSuccessTimestamps: Map<string, number> = new Map();

  onModuleInit(): void {
    const meter = metrics.getMeter('mist-collector', '1.0.0');

    this.tasksCounter = meter.createCounter(
      'mist_post_close_sync_tasks_total',
      {
        description:
          'Total number of post-close sync tasks partitioned by status, source and period',
      },
    );

    this.klinesSavedCounter = meter.createCounter(
      'mist_post_close_sync_klines_saved_total',
      {
        description: 'Total number of K-lines saved by post-close sync',
      },
    );

    this.durationHistogram = meter.createHistogram(
      'mist_post_close_sync_duration_seconds',
      {
        description: 'Duration of post-close sync execution in seconds',
        unit: 's',
      },
    );

    meter
      .createObservableGauge('mist_post_close_sync_last_success_age_seconds', {
        description:
          'Seconds elapsed since last successful post-close synchronization run',
      })
      .addCallback((observableResult) => {
        const now = Date.now();
        for (const [
          window,
          lastSuccessTime,
        ] of this.lastSuccessTimestamps.entries()) {
          const ageSeconds = Math.max(
            0,
            Math.floor((now - lastSuccessTime) / 1000),
          );
          observableResult.observe(ageSeconds, { window });
        }
      });
  }

  recordTask(
    status: 'succeeded' | 'not_ready' | 'failed',
    source: DataSource,
    period: Period,
  ): void {
    this.tasksCounter?.add(1, {
      status,
      source: String(source),
      period: String(period),
    });
  }

  recordKLinesSaved(source: DataSource, period: Period, count: number): void {
    if (count > 0) {
      this.klinesSavedCounter?.add(count, {
        source: String(source),
        period: String(period),
      });
    }
  }

  recordDuration(window: string, durationMs: number): void {
    this.durationHistogram?.record(durationMs / 1000, { window });
  }

  recordSuccessfulRun(window: string): void {
    this.lastSuccessTimestamps.set(window, Date.now());
  }
}
