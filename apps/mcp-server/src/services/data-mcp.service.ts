import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, MarketDataBar, KPeriod } from '@app/shared-data';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { ValidationHelper } from '../utils/validation.helpers';
import { McpErrorCode, McpError } from '@app/constants';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PeriodEnum = z.enum(['1min', '5min', '15min', '30min', '60min', 'daily']);

@Injectable()
export class DataMcpService extends BaseMcpToolService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private readonly marketDataBarRepository: Repository<MarketDataBar>,
  ) {
    super(DataMcpService.name);
  }

  /**
   * Map validation error messages to error codes
   */
  private getValidationErrorCode(errorMsg: string): McpErrorCode {
    if (errorMsg.includes('symbol') || errorMsg.includes('Symbol cannot')) {
      return McpErrorCode.INVALID_SYMBOL;
    }
    if (errorMsg.includes('limit') && errorMsg.includes('must be at least')) {
      return McpErrorCode.INVALID_PARAMETER;
    }
    if (
      errorMsg.includes('date range') ||
      errorMsg.includes('must be before') ||
      errorMsg.includes('Invalid date format')
    ) {
      return McpErrorCode.INVALID_DATE_RANGE;
    }
    if (errorMsg.includes('not found')) {
      return McpErrorCode.INDEX_NOT_FOUND;
    }
    if (
      errorMsg.includes('must contain at least') ||
      errorMsg.includes('elements')
    ) {
      return McpErrorCode.INSUFFICIENT_DATA;
    }
    return McpErrorCode.INVALID_PARAMETER;
  }

  @Tool({
    name: 'get_index_info',
    description: `Get detailed metadata for a specific index.

PURPOSE: Retrieve index information and metadata. Useful for validating
symbol existence and getting basic details.

WHEN TO USE: Validating a symbol before detailed queries, getting
index metadata, checking if index exists.

REQUIRES: symbol - Index code (e.g., '000001').

NOTE: Use list_indices to see all available symbols first.

RETURNS: Index object with id, symbol, name, and type.`,
  })
  async getIndexInfo(symbol: string) {
    return this.executeTool('get_index_info', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          this.getValidationErrorCode(symbolError),
        );
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });

      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      return {
        id: security.id,
        symbol: security.code,
        name: security.name,
        type: security.type,
      };
    });
  }

  @Tool({
    name: 'get_kline_data',
    description: `Get intraday K-line data from database.

PURPOSE: Retrieve historical intraday price data.

WHEN TO USE: Getting data for analysis.

REQUIRES: symbol, period (1min/5min/15min/30min/60min).
Optional: limit (default 100), startTime, endTime.

NOTE: Use list_indices first.

RETURNS: K-line array with time, OHLC, volume.`,
  })
  async getKlineData(
    symbol: string,
    period: z.infer<typeof PeriodEnum>,
    limit: number = 100,
    startTime?: string,
    endTime?: string,
  ) {
    return this.executeTool('get_kline_data', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          this.getValidationErrorCode(symbolError),
        );
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new McpError(limitError, this.getValidationErrorCode(limitError));
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startTime,
        endTime,
      );
      if (dateRangeError) {
        throw new McpError(
          dateRangeError,
          this.getValidationErrorCode(dateRangeError),
        );
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      const queryBuilder = this.marketDataBarRepository
        .createQueryBuilder('bar')
        .leftJoin('bar.security', 'security')
        .where('security.id = :securityId', { securityId: security.id })
        .andWhere('bar.period = :period', { period })
        .orderBy('bar.timestamp', 'DESC')
        .limit(limit);

      if (startTime) {
        queryBuilder.andWhere('bar.timestamp >= :startTime', { startTime });
      }
      if (endTime) {
        queryBuilder.andWhere('bar.timestamp <= :endTime', { endTime });
      }

      const data = await queryBuilder.getMany();

      return data.map((item) => ({
        id: item.id,
        time: item.timestamp,
        open: item.open,
        close: item.close,
        highest: item.high,
        lowest: item.low,
        volume: item.volume.toString(),
      }));
    });
  }

  @Tool({
    name: 'get_daily_kline',
    description: `Get daily K-line (candlestick) data from database.

PURPOSE: Retrieve historical daily price data for longer-term analysis.
Contains OHLC, volume, and amount.

WHEN TO USE: Daily/swing trading analysis, long-term trends.

REQUIRES: symbol (e.g., '000001').
Optional: limit (default 100), startDate, endDate.

NOTE: Use list_indices first. Use get_kline_data for intraday.

RETURNS: Array of daily K-line objects with OHLC, volume, amount.`,
  })
  async getDailyKline(
    symbol: string,
    limit: number = 100,
    startDate?: string,
    endDate?: string,
  ) {
    return this.executeTool('get_daily_kline', async () => {
      // Validate symbol
      const symbolError = ValidationHelper.validateSymbol(symbol);
      if (symbolError) {
        throw new McpError(
          symbolError,
          this.getValidationErrorCode(symbolError),
        );
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new McpError(limitError, this.getValidationErrorCode(limitError));
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startDate,
        endDate,
      );
      if (dateRangeError) {
        throw new McpError(
          dateRangeError,
          this.getValidationErrorCode(dateRangeError),
        );
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const security = await this.securityRepository.findOne({
        where: { code: sanitizedSymbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      const queryBuilder = this.marketDataBarRepository
        .createQueryBuilder('bar')
        .leftJoin('bar.security', 'security')
        .where('security.id = :securityId', { securityId: security.id })
        .andWhere('bar.period = :period', { period: BarPeriod.DAILY })
        .orderBy('bar.timestamp', 'DESC')
        .limit(limit);

      if (startDate) {
        queryBuilder.andWhere('bar.timestamp >= :startDate', { startDate });
      }
      if (endDate) {
        queryBuilder.andWhere('bar.timestamp <= :endDate', { endDate });
      }

      const data = await queryBuilder.getMany();

      return data.map((item) => ({
        id: item.id,
        time: item.timestamp,
        open: item.open,
        close: item.close,
        highest: item.high,
        lowest: item.low,
        volume: item.volume.toString(),
        amount: item.amount,
      }));
    });
  }

  @Tool({
    name: 'list_indices',
    description: `List all available stock indices in the database.

PURPOSE: Discovery tool to find available indices for analysis.
Use BEFORE calling other data tools.

WHEN TO USE: Finding available symbols, validating symbol codes.

REQUIRES: No parameters.

RETURNS: Array of index objects with id, symbol, name, and type.
NOTE: This should be your first data query tool call.`,
  })
  async listIndices() {
    return this.executeTool('list_indices', async () => {
      const securities = await this.securityRepository.find({
        select: ['id', 'code', 'name', 'type'],
      });
      return securities.map((s) => ({
        id: s.id,
        symbol: s.code,
        name: s.name,
        type: s.type,
      }));
    });
  }

  @Tool({
    name: 'get_latest_data',
    description: `Get the latest K-line data for all time periods.

PURPOSE: Retrieve the most recent data point across all timeframes
(daily and all intraday periods) in a single call.

WHEN TO USE: Getting current market snapshot, checking data freshness,
quick status check across all periods.

REQUIRES: symbol - Index code (e.g., '000001').

RETURNS: Object containing latest data for daily, 1min, 5min,
15min, 30min, 60min. Each has time, OHLC, volume.`,
  })
  async getLatestData(symbol: string) {
    return this.executeTool('get_latest_data', async () => {
      const security = await this.securityRepository.findOne({
        where: { code: symbol },
      });
      if (!security) {
        throw new McpError(
          `Security with symbol ${symbol} not found`,
          McpErrorCode.INDEX_NOT_FOUND,
        );
      }

      const periods: KPeriod[] = [
        KPeriod.MIN_1,
        KPeriod.MIN_5,
        KPeriod.MIN_15,
        KPeriod.MIN_30,
        KPeriod.MIN_60,
      ];

      const [dailyData, ...periodData] = await Promise.all([
        this.marketDataBarRepository
          .createQueryBuilder('bar')
          .leftJoin('bar.security', 'security')
          .where('security.id = :securityId', { securityId: security.id })
          .andWhere('bar.period = :period', { period: KPeriod.DAILY })
          .orderBy('bar.timestamp', 'DESC')
          .limit(1)
          .getOne(),
        ...periods.map((period) =>
          this.marketDataBarRepository
            .createQueryBuilder('bar')
            .leftJoin('bar.security', 'security')
            .where('security.id = :securityId', { securityId: security.id })
            .andWhere('bar.period = :period', { period })
            .orderBy('bar.timestamp', 'DESC')
            .limit(1)
            .getOne(),
        ),
      ]);

      return {
        symbol,
        name: security.name,
        daily: dailyData,
        '1min': periodData[0],
        '5min': periodData[1],
        '15min': periodData[2],
        '30min': periodData[3],
        '60min': periodData[4],
      };
    });
  }
}
