import { Injectable, Logger } from '@nestjs/common';
import { MCPTool, MCPToolParam } from '@rekog/mcp-nest';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexData } from '@app/shared-data';
import { IndexPeriod } from '@app/shared-data';
import { IndexDaily } from '@app/shared-data';

/**
 * MCP Service for Stock Data Query
 *
 * Provides tools for querying stock market data:
 * - Index data (指数信息)
 * - Index period data (分时数据: 1min, 5min, 15min, 30min, 60min)
 * - Index daily data (日线数据)
 */
@Injectable()
export class DataMcpService {
  private readonly logger = new Logger(DataMcpService.name);

  constructor(
    @InjectRepository(IndexData)
    private readonly indexDataRepository: Repository<IndexData>,
    @InjectRepository(IndexPeriod)
    private readonly indexPeriodRepository: Repository<IndexPeriod>,
    @InjectRepository(IndexDaily)
    private readonly indexDailyRepository: Repository<IndexDaily>,
  ) {}

  /**
   * Get index information by symbol
   *
   * @param symbol - Index symbol (e.g., '000001')
   * @returns Index data with symbol, name, type
   */
  @MCPTool('get_index_info', '根据代码获取指数信息')
  async getIndexInfo(
    @MCPToolParam('symbol', '指数代码（如：000001）', 'string')
    symbol: string,
  ) {
    this.logger.debug(`Querying index info for symbol: ${symbol}`);
    const index = await this.indexDataRepository.findOne({
      where: { symbol },
    });

    if (!index) {
      this.logger.warn(`Index not found for symbol: ${symbol}`);
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    this.logger.debug(`Found index: ${index.name} (${index.symbol})`);
    return {
      success: true,
      data: {
        id: index.id,
        symbol: index.symbol,
        name: index.name,
        type: index.type,
      },
    };
  }

  /**
   * Get K-line data for a specific index and period
   *
   * @param symbol - Index symbol
   * @param period - Time period (ONE, FIVE, FIFTEEN, THIRTY, SIXTY)
   * @param limit - Maximum number of records to return (default: 100)
   * @param startTime - Optional start time filter
   * @param endTime - Optional end time filter
   * @returns Array of K-line data
   */
  @MCPTool('get_kline_data', '获取K线数据（分时数据）')
  async getKlineData(
    @MCPToolParam('symbol', '指数代码（如：000001）', 'string')
    symbol: string,
    @MCPToolParam(
      'period',
      '时间周期（ONE/FIVE/FIFTEEN/THIRTY/SIXTY）',
      'string',
    )
    period: 'ONE' | 'FIVE' | 'FIFTEEN' | 'THIRTY' | 'SIXTY',
    @MCPToolParam('limit', '返回记录数限制', 'number')
    limit: number = 100,
    @MCPToolParam('startTime', '开始时间（可选）', 'string')
    startTime?: string,
    @MCPToolParam('endTime', '结束时间（可选）', 'string')
    endTime?: string,
  ) {
    this.logger.debug(
      `Querying K-line data for symbol: ${symbol}, period: ${period}, limit: ${limit}`,
    );

    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
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

    this.logger.debug(`Found ${data.length} K-line records`);

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
        price: item.price,
      })),
      count: data.length,
      params: { symbol, period, limit },
    };
  }

  /**
   * Get daily K-line data for a specific index
   *
   * @param symbol - Index symbol
   * @param limit - Maximum number of records to return (default: 100)
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Array of daily K-line data
   */
  @MCPTool('get_daily_kline', '获取日线K线数据')
  async getDailyKline(
    @MCPToolParam('symbol', '指数代码（如：000001）', 'string')
    symbol: string,
    @MCPToolParam('limit', '返回记录数限制', 'number')
    limit: number = 100,
    @MCPToolParam('startDate', '开始日期（可选）', 'string')
    startDate?: string,
    @MCPToolParam('endDate', '结束日期（可选）', 'string')
    endDate?: string,
  ) {
    this.logger.debug(
      `Querying daily K-line for symbol: ${symbol}, limit: ${limit}`,
    );

    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
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

    this.logger.debug(`Found ${data.length} daily K-line records`);

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
        price: item.price,
        turnoverRate: item.turnoverRate,
      })),
      count: data.length,
      params: { symbol, limit },
    };
  }

  /**
   * Get all available indices
   *
   * @returns Array of all indices in the database
   */
  @MCPTool('list_indices', '获取所有可用的指数列表')
  async listIndices() {
    this.logger.debug('Querying all indices');
    const indices = await this.indexDataRepository.find({
      select: ['id', 'symbol', 'name', 'type'],
    });
    this.logger.debug(`Found ${indices.length} indices`);
    return {
      success: true,
      data: indices,
      count: indices.length,
    };
  }

  /**
   * Get latest data for an index (all periods)
   *
   * @param symbol - Index symbol
   * @returns Latest data for all time periods
   */
  @MCPTool('get_latest_data', '获取指数的最新数据（所有周期）')
  async getLatestData(
    @MCPToolParam('symbol', '指数代码（如：000001）', 'string')
    symbol: string,
  ) {
    this.logger.debug(`Querying latest data for symbol: ${symbol}`);

    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
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
      success: true,
      data: {
        symbol,
        name: index.name,
        daily: dailyData,
        '1min': periodData[0],
        '5min': periodData[1],
        '15min': periodData[2],
        '30min': periodData[3],
        '60min': periodData[4],
      },
    };
  }
}
