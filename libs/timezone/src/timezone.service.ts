import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { format, fromUnixTime, millisecondsToSeconds } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ERROR_MESSAGES } from '@app/constants';
import { UtilsService } from '@app/utils';
import { BEIJING_DATE_REGEX } from './date-format.const';

/**
 * SZSE API response type.
 */
interface SzseTradingDayResponse {
  data: Array<{
    zrxh: number; // 序号
    jybz: string; // 交易标志: '1' = 交易日, '0' = 非交易日
    jyrq: string; // 交易日期, format: 'yyyy-MM-dd'
  }>;
}

@Injectable()
export class TimezoneService {
  private readonly logger = new Logger(TimezoneService.name);
  private readonly axios: ReturnType<UtilsService['createAxiosInstance']>;

  /**
   * Trading day cache.
   * Key: 'yyyy-MM-dd', Value: boolean (true = trading day, false = non-trading day)
   */
  private tradingDayCache: Map<string, boolean> = new Map();

  /**
   * Cache expiry time (in milliseconds). Default: 1 hour.
   */
  private readonly cacheExpiry = 60 * 60 * 1000;

  /**
   * Cache timestamp map.
   * Key: 'yyyy-MM-dd', Value: timestamp when the entry was cached
   */
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(private readonly utilsService: UtilsService) {
    this.axios = this.utilsService.createAxiosInstance({
      timeout: 10000,
    });
  }

  convertTimestamp2Date(timestamp: number) {
    return fromUnixTime(millisecondsToSeconds(timestamp));
  }

  /**
   * Parse date string to Date object.
   * Accepts "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD".
   * Interpreted as Beijing time (Asia/Shanghai, UTC+8).
   *
   * Implementation: appends "+08:00" and uses Date constructor,
   * which is timezone-agnostic (works regardless of server timezone).
   */
  parseDateString(dateStr: string): Date {
    if (!BEIJING_DATE_REGEX.test(dateStr)) {
      throw new HttpException(
        `Invalid date format: "${dateStr}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Append " 00:00:00" if date-only, then convert to ISO with +08:00 offset
    const normalized = dateStr.includes(' ') ? dateStr : `${dateStr} 00:00:00`;
    const isoString = normalized.replace(' ', 'T') + '+08:00';
    const result = new Date(isoString);

    if (isNaN(result.getTime())) {
      throw new HttpException(
        `Invalid date: "${dateStr}". Date values are out of range.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }

  /**
   * Get current Beijing time.
   *
   * Converts the current system time (UTC) to Beijing timezone (Asia/Shanghai).
   * Use this method instead of `new Date()` when you need the current time in Beijing timezone.
   *
   * @returns Current date/time in Beijing timezone
   */
  getCurrentBeijingTime(): Date {
    return toZonedTime(new Date(), 'Asia/Shanghai');
  }

  /**
   * Check if a given date is a trading day.
   *
   * Uses Shenzhen Stock Exchange (SZSE) API to get trading calendar.
   * Implements caching to avoid excessive API calls.
   *
   * @param date - Date to check
   * @returns Promise<boolean> - true if trading day, false otherwise
   */
  async isTradingDay(date: Date): Promise<boolean> {
    const dateKey = format(date, 'yyyy-MM-dd');

    // Check cache first
    const cached = this.getCachedTradingDay(dateKey);
    if (cached !== null) {
      return cached;
    }

    try {
      // Fetch from SZSE API
      const isTradingDay = await this.fetchTradingDayFromSZSE(date);
      this.setCachedTradingDay(dateKey, isTradingDay);
      return isTradingDay;
    } catch (error) {
      this.logger.error(
        `Failed to fetch trading day from SZSE API, using weekend fallback: ${error}`,
      );
      // Fallback to weekend check
      const isWeekend = this.isWeekend(date);
      this.setCachedTradingDay(dateKey, !isWeekend);
      return !isWeekend;
    }
  }

  /**
   * Fetch trading day status from SZSE API.
   *
   * @param date - Date to check
   * @returns Promise<boolean> - true if trading day, false otherwise
   */
  private async fetchTradingDayFromSZSE(date: Date): Promise<boolean> {
    try {
      const response = (await this.axios.get(
        'http://www.szse.cn/api/report/exchange/onepersistenthour/monthList',
        {
          params: {
            yearMonth: format(date, 'yyyy-MM'),
          },
        },
      )) as SzseTradingDayResponse;

      const tradingDay = response.data?.find(
        (day: { zrxh: number; jybz: string; jyrq: string }) =>
          day.jyrq === format(date, 'yyyy-MM-dd') && day.jybz === '1',
      );

      return !!tradingDay;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `SZSE API error: ${error.message}`,
          error.response?.data,
        );
        throw new HttpException(
          ERROR_MESSAGES.TRADING_DAY_CHECK_FAILED,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  /**
   * Check if a date is on weekend (Saturday or Sunday).
   */
  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Get cached trading day status.
   * Returns null if not cached or cache expired.
   */
  private getCachedTradingDay(dateKey: string): boolean | null {
    const timestamp = this.cacheTimestamps.get(dateKey);
    if (!timestamp) {
      return null;
    }

    const now = Date.now();
    if (now - timestamp > this.cacheExpiry) {
      // Cache expired
      this.tradingDayCache.delete(dateKey);
      this.cacheTimestamps.delete(dateKey);
      return null;
    }

    return this.tradingDayCache.get(dateKey) ?? null;
  }

  /**
   * Set cached trading day status.
   */
  private setCachedTradingDay(dateKey: string, isTradingDay: boolean): void {
    this.tradingDayCache.set(dateKey, isTradingDay);
    this.cacheTimestamps.set(dateKey, Date.now());
  }

  /**
   * Clear trading day cache.
   * Useful for testing or force refresh.
   */
  clearTradingDayCache(): void {
    this.tradingDayCache.clear();
    this.cacheTimestamps.clear();
  }
}
