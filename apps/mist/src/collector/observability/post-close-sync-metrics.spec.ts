import { DataSource, Period } from '@app/shared-data';
import { PostCloseSyncMetrics } from './post-close-sync-metrics';

describe('PostCloseSyncMetrics', () => {
  let metrics: PostCloseSyncMetrics;

  beforeEach(() => {
    metrics = new PostCloseSyncMetrics();
    metrics.onModuleInit();
  });

  it('records tasks, klines, duration and success runs without errors', () => {
    expect(() => {
      metrics.recordTask('succeeded', DataSource.QMT, Period.DAY);
      metrics.recordTask('not_ready', DataSource.TDX, Period.ONE_MIN);
      metrics.recordTask('failed', DataSource.EAST_MONEY, Period.FIVE_MIN);
      metrics.recordKLinesSaved(DataSource.QMT, Period.DAY, 240);
      metrics.recordDuration('nightly_2230', 1500);
      metrics.recordSuccessfulRun('nightly_2230');
    }).not.toThrow();
  });
});
