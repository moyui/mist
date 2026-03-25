import { Period } from '@app/shared-data';
import {
  IKLineMergeService,
  RawKLineData,
  MergedKLineData,
} from './kline-merge.service';

/**
 * East Money (东方财富) K-line merge service implementation.
 *
 * Handles merging of raw K-line data from East Money API into different periods.
 * East Money provides 1-minute data which can be merged into:
 * - 5min, 15min, 30min, 60min (intraday periods)
 * - daily, weekly, monthly, etc. (longer periods)
 *
 * Merging Logic:
 * - Open: First candle's open in the period
 * - High: Maximum high in the period
 * - Low: Minimum low in the period
 * - Close: Last candle's close in the period
 * - Volume: Sum of all volumes in the period
 * - Amount: Sum of all amounts in the period
 */
export class EastMoneyKLineMergeService implements IKLineMergeService {
  /**
   * Merge raw K-line data into target period.
   *
   * @param rawData - Array of raw K-line data (typically 1min)
   * @param targetPeriod - Target period to merge into
   * @param sourcePeriod - Period of raw data (default: 1min)
   * @returns Merged K-line data in target period
   */
  mergeKLineData(
    rawData: RawKLineData[],
    targetPeriod: Period,
    sourcePeriod: Period = Period.ONE_MIN,
  ): MergedKLineData[] {
    if (rawData.length === 0) {
      return [];
    }

    // Get period multiplier
    const multiplier = this.getPeriodMultiplier(targetPeriod, sourcePeriod);

    if (multiplier === 1) {
      // No merging needed
      return rawData as MergedKLineData[];
    }

    // Group data by period
    const groups = this.groupByPeriod(rawData, multiplier);

    // Merge each group
    return groups.map((group) => this.mergeGroup(group));
  }

  /**
   * Build X-minute data from 1-minute data.
   * Convenience method for common merging scenario.
   *
   * @param oneMinData - Array of 1-minute K-line data
   * @param minutes - Number of minutes per candle (5, 15, 30, 60)
   * @returns Merged K-line data
   */
  buildXMinData(
    oneMinData: RawKLineData[],
    minutes: number,
  ): MergedKLineData[] {
    if (oneMinData.length === 0) {
      return [];
    }

    // Group data by X-minute periods
    const groups = this.groupByMinutes(oneMinData, minutes);

    // Merge each group
    return groups.map((group) => this.mergeGroup(group));
  }

  /**
   * Group raw data by period multiplier.
   */
  private groupByPeriod(
    data: RawKLineData[],
    multiplier: number,
  ): RawKLineData[][] {
    const groups: RawKLineData[][] = [];
    const currentGroup: RawKLineData[] = [];

    for (let i = 0; i < data.length; i++) {
      currentGroup.push(data[i]);

      // Start new group when reaching multiplier
      if (currentGroup.length === multiplier) {
        groups.push([...currentGroup]);
        currentGroup.length = 0;
      }
    }

    // Add remaining data as partial group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Group raw data by minute intervals.
   * Aligns timestamps to period boundaries (e.g., 09:30, 09:35, 09:40 for 5min).
   */
  private groupByMinutes(
    data: RawKLineData[],
    minutes: number,
  ): RawKLineData[][] {
    const groupsMap = new Map<number, RawKLineData[]>();

    for (const item of data) {
      // Calculate period boundary timestamp
      const timestamp = item.timestamp.getTime();
      const periodStart = Math.floor(timestamp / (minutes * 60 * 1000));

      if (!groupsMap.has(periodStart)) {
        groupsMap.set(periodStart, []);
      }

      groupsMap.get(periodStart)!.push(item);
    }

    // Convert map to array of groups, sorted by timestamp
    return Array.from(groupsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, group]) => group);
  }

  /**
   * Merge a group of K-line data into single candle.
   */
  private mergeGroup(group: RawKLineData[]): MergedKLineData {
    if (group.length === 0) {
      throw new Error('Cannot merge empty group');
    }

    // Sort by timestamp to ensure correct order
    const sorted = group.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const open = sorted[0].open;
    const close = sorted[sorted.length - 1].close;
    const high = Math.max(...sorted.map((d) => d.high));
    const low = Math.min(...sorted.map((d) => d.low));
    const volume = sorted.reduce((sum, d) => sum + d.volume, 0);
    const amount = sorted.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Use first timestamp in group
    const timestamp = sorted[0].timestamp;

    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      amount,
    };
  }

  /**
   * Get period multiplier (how many source periods fit into target period).
   */
  private getPeriodMultiplier(
    targetPeriod: Period,
    sourcePeriod: Period,
  ): number {
    const periodMinutes: Record<Period, number> = {
      [Period.ONE_MIN]: 1,
      [Period.FIVE_MIN]: 5,
      [Period.FIFTEEN_MIN]: 15,
      [Period.THIRTY_MIN]: 30,
      [Period.SIXTY_MIN]: 60,
      [Period.DAY]: 1440, // 24 * 60
      [Period.WEEK]: 10080, // 7 * 24 * 60
      [Period.MONTH]: 43200, // 30 * 24 * 60
      [Period.QUARTER]: 129600, // 90 * 24 * 60
      [Period.YEAR]: 525600, // 365 * 24 * 60
    };

    const targetMinutes = periodMinutes[targetPeriod];
    const sourceMinutes = periodMinutes[sourcePeriod];

    return Math.floor(targetMinutes / sourceMinutes);
  }
}
