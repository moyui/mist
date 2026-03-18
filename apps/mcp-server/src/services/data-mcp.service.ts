import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexData } from '@app/shared-data';
import { IndexPeriod } from '@app/shared-data';
import { IndexDaily } from '@app/shared-data';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';
import { ValidationHelper } from '../utils/validation.helpers';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PeriodEnum = z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY']);

@Injectable()
export class DataMcpService extends BaseMcpToolService {
  constructor(
    @InjectRepository(IndexData)
    private readonly indexDataRepository: Repository<IndexData>,
    @InjectRepository(IndexPeriod)
    private readonly indexPeriodRepository: Repository<IndexPeriod>,
    @InjectRepository(IndexDaily)
    private readonly indexDailyRepository: Repository<IndexDaily>,
  ) {
    super(DataMcpService.name);
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
        throw new Error(symbolError);
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const index = await this.indexDataRepository.findOne({
        where: { symbol: sanitizedSymbol },
      });

      if (!index) {
        throw new Error(
          `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
        );
      }

      return {
        id: index.id,
        symbol: index.symbol,
        name: index.name,
        type: index.type,
      };
    });
  }

  @Tool({
    name: 'get_kline_data',
    description: `Get intraday K-line (candlestick) data from database.

PURPOSE: Retrieve historical intraday price data for technical analysis.
Contains OHLC and volume for each time period.

WHEN TO USE: Getting historical data for analysis, feeding data into
indicator or Chan Theory tools.

REQUIRES: symbol (e.g., '000001'), period (ONE/FIVE/FIFTEEN/THIRTY/SIXTY).
Optional: limit (default 100), startTime, endTime.

NOTE: Use list_indices first to get available symbols.
Use get_daily_kline for daily data.

RETURNS: Array of K-line objects with time, OHLC, volume.`,
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
        throw new Error(symbolError);
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new Error(limitError);
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startTime,
        endTime,
      );
      if (dateRangeError) {
        throw new Error(dateRangeError);
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const index = await this.indexDataRepository.findOne({
        where: { symbol: sanitizedSymbol },
      });
      if (!index) {
        throw new Error(
          `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
        );
      }

      const queryBuilder = this.indexPeriodRepository
        .createQueryBuilder('ip')
        .where('ip.index_id = :indexId', { indexId: index.id })
        .andWhere('ip.type = :period', { period })
        .orderBy('ip.time', 'DESC')
        .limit(limit);

      if (startTime) {
        queryBuilder.andWhere('ip.time >= :startTime', { startTime });
      }
      if (endTime) {
        queryBuilder.andWhere('ip.time <= :endTime', { endTime });
      }

      const data = await queryBuilder.getMany();

      return data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
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
        throw new Error(symbolError);
      }

      // Validate limit
      const limitError = ValidationHelper.validateLimit(limit, 10000);
      if (limitError) {
        throw new Error(limitError);
      }

      // Validate date range
      const dateRangeError = ValidationHelper.validateDateRange(
        startDate,
        endDate,
      );
      if (dateRangeError) {
        throw new Error(dateRangeError);
      }

      const sanitizedSymbol = ValidationHelper.sanitizeString(symbol)!;

      const index = await this.indexDataRepository.findOne({
        where: { symbol: sanitizedSymbol },
      });
      if (!index) {
        throw new Error(
          `Index with symbol "${sanitizedSymbol}" not found. Use list_indices to see available symbols.`,
        );
      }

      const queryBuilder = this.indexDailyRepository
        .createQueryBuilder('id')
        .where('id.index_id = :indexId', { indexId: index.id })
        .orderBy('id.time', 'DESC')
        .limit(limit);

      if (startDate) {
        queryBuilder.andWhere('id.time >= :startDate', { startDate });
      }
      if (endDate) {
        queryBuilder.andWhere('id.time <= :endDate', { endDate });
      }

      const data = await queryBuilder.getMany();

      return data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
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
      const indices = await this.indexDataRepository.find({
        select: ['id', 'symbol', 'name', 'type'],
      });
      return indices;
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
      const index = await this.indexDataRepository.findOne({
        where: { symbol },
      });
      if (!index) {
        throw new Error(`Index with symbol ${symbol} not found`);
      }

      const periods: ('ONE' | 'FIVE' | 'FIFTEEN' | 'THIRTY' | 'SIXTY')[] = [
        'ONE',
        'FIVE',
        'FIFTEEN',
        'THIRTY',
        'SIXTY',
      ];

      const [dailyData, ...periodData] = await Promise.all([
        this.indexDailyRepository
          .createQueryBuilder('id')
          .where('id.index_id = :indexId', { indexId: index.id })
          .orderBy('id.time', 'DESC')
          .limit(1)
          .getOne(),
        ...periods.map((period) =>
          this.indexPeriodRepository
            .createQueryBuilder('ip')
            .where('ip.index_id = :indexId', { indexId: index.id })
            .andWhere('ip.type = :period', { period })
            .orderBy('ip.time', 'DESC')
            .limit(1)
            .getOne(),
        ),
      ]);

      return {
        symbol,
        name: index.name,
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
