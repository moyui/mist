import { Injectable } from '@nestjs/common';
import { Period } from '@app/shared-data';
import {
  DataFreshnessStatus,
  FreshnessValidationResult,
} from '../types/post-close-sync.types';

@Injectable()
export class DataFreshnessValidator {
  private static readonly EXPECTED_BAR_COUNTS: Partial<Record<Period, number>> =
    {
      [Period.ONE_MIN]: 240,
      [Period.FIVE_MIN]: 48,
      [Period.FIFTEEN_MIN]: 16,
      [Period.THIRTY_MIN]: 8,
      [Period.SIXTY_MIN]: 4,
      [Period.DAY]: 1,
      [Period.WEEK]: 1,
      [Period.MONTH]: 1,
    };

  /**
   * 验证拉取到的 K 线数据是否具备权威最新性与完整性
   */
  validateFreshness(
    bars: Array<{ timestamp?: Date | string; date?: string; time?: string }>,
    targetDateStr: string,
    period: Period,
  ): FreshnessValidationResult {
    const expectedBarCount =
      DataFreshnessValidator.EXPECTED_BAR_COUNTS[period] ?? 1;

    if (!bars || bars.length === 0) {
      return {
        status: DataFreshnessStatus.NOT_LATEST,
        barCount: 0,
        expectedBarCount,
        reason: `No bars returned for target date ${targetDateStr} and period ${period}`,
      };
    }

    if (
      period === Period.DAY ||
      period === Period.WEEK ||
      period === Period.MONTH
    ) {
      return this.validateDailyBar(bars, targetDateStr, expectedBarCount);
    }

    return this.validateIntradayMinuteBars(
      bars,
      targetDateStr,
      expectedBarCount,
    );
  }

  private validateDailyBar(
    bars: Array<{ timestamp?: Date | string; date?: string; time?: string }>,
    targetDateStr: string,
    expectedBarCount: number,
  ): FreshnessValidationResult {
    const hasTargetDate = bars.some((bar) => {
      const barDate = this.extractBarDateStr(bar);
      return barDate === targetDateStr;
    });

    if (hasTargetDate) {
      return {
        status: DataFreshnessStatus.READY,
        barCount: bars.length,
        expectedBarCount,
        latestBarTime: this.extractBarDateStr(bars[bars.length - 1]),
      };
    }

    const latestDate = this.extractBarDateStr(bars[bars.length - 1]);
    return {
      status: DataFreshnessStatus.NOT_LATEST,
      barCount: bars.length,
      expectedBarCount,
      latestBarTime: latestDate,
      reason: `Latest daily bar (${latestDate}) has not reached target date ${targetDateStr}`,
    };
  }

  private validateIntradayMinuteBars(
    bars: Array<{ timestamp?: Date | string; date?: string; time?: string }>,
    targetDateStr: string,
    expectedBarCount: number,
  ): FreshnessValidationResult {
    const targetDateBars = bars.filter((bar) => {
      const barDate = this.extractBarDateStr(bar);
      return barDate === targetDateStr;
    });

    if (targetDateBars.length === 0) {
      const latestDate = this.extractBarDateStr(bars[bars.length - 1]);
      return {
        status: DataFreshnessStatus.NOT_LATEST,
        barCount: 0,
        expectedBarCount,
        latestBarTime: latestDate,
        reason: `No minute bars found for target date ${targetDateStr} (latest is ${latestDate})`,
      };
    }

    // 检查根数是否达到标准预期（允许极个别边界，如 >= 95% 期望）
    if (targetDateBars.length < expectedBarCount) {
      return {
        status: DataFreshnessStatus.INCOMPLETE_BARS,
        barCount: targetDateBars.length,
        expectedBarCount,
        reason: `Incomplete minute bars on ${targetDateStr}: received ${targetDateBars.length} / expected ${expectedBarCount}`,
      };
    }

    return {
      status: DataFreshnessStatus.READY,
      barCount: targetDateBars.length,
      expectedBarCount,
    };
  }

  private extractBarDateStr(bar: {
    timestamp?: Date | string;
    date?: string;
    time?: string;
  }): string {
    if (bar.date) {
      return String(bar.date).slice(0, 10);
    }
    if (bar.timestamp) {
      const d =
        bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
    if (bar.time) {
      return String(bar.time).slice(0, 10);
    }
    return '';
  }
}
