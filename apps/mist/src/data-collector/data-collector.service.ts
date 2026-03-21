import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KLine, KLinePeriod } from '@app/shared-data';
import {
  ISourceFetcher,
  KLineFetchParams,
  KLineData,
} from './interfaces/source-fetcher.interface';
import { StockService } from '../stock/stock.service';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { Period } from '../chan/enums/period.enum';
import { DataSource } from '@app/shared-data';
import { Stock } from '../stock/stock.entity';

@Injectable()
export class DataCollectorService {
  private sources: Map<DataSource, ISourceFetcher> = new Map();

  constructor(
    @InjectRepository(KLine)
    private readonly kLineRepository: Repository<KLine>,
    private readonly stockService: StockService,
    private readonly eastMoneySource: EastMoneySource,
    private readonly tdxSource: TdxSource,
  ) {
    this.registerDataSources();
  }

  private registerDataSources(): void {
    this.sources.set(DataSource.EAST_MONEY, this.eastMoneySource);
    this.sources.set(DataSource.TDX, this.tdxSource);
  }

  async collectKLine(
    stockCode: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    try {
      // Validate stock exists and is active
      const stock = await this.stockService.findByCode(stockCode);

      // Get the appropriate data source for this stock
      const sourceConfig = await this.stockService.getSourceFormat(stockCode);
      const dataSource = this.getSourceType(sourceConfig.type);

      const sourceFetcher = this.sources.get(dataSource);
      if (!sourceFetcher) {
        throw new BadRequestException(
          `Data source ${sourceConfig.type} is not available`,
        );
      }

      // Check if period is supported
      if (!sourceFetcher.isSupportedPeriod(period)) {
        throw new BadRequestException(
          `Period ${period} is not supported by data source ${sourceConfig.type}`,
        );
      }

      // Fetch data from the source
      const fetchParams: KLineFetchParams = {
        code: stockCode,
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchKLine(fetchParams);

      if (kLineData.length === 0) {
        console.warn(
          `No data returned for stock ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return;
      }

      // Save data to database
      await this.saveKLineData(stock, kLineData, dataSource, period);

      console.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period}`,
      );
    } catch (error) {
      console.error(`Failed to collect K-line data for ${stockCode}:`, error);
      throw error;
    }
  }

  private async saveKLineData(
    stock: Stock,
    kLineData: KLineData[],
    dataSource: DataSource,
    period: Period,
  ): Promise<void> {
    const kLineEntities = kLineData.map((data) => {
      const kLine = this.kLineRepository.create({
        stock,
        source: dataSource,
        period: this.convertPeriodToKLinePeriod(period),
        timestamp: data.timestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: BigInt(Math.round(data.volume)),
        amount: data.amount || 0,
      });

      return kLine;
    });

    await this.kLineRepository.save(kLineEntities);
  }

  private getSourceType(type: string): DataSource {
    switch (type.toLowerCase()) {
      case 'east_money':
      case 'eastmoney':
        return DataSource.EAST_MONEY;
      case 'tdx':
        return DataSource.TDX;
      default:
        throw new BadRequestException(`Unknown data source type: ${type}`);
    }
  }

  private convertPeriodToKLinePeriod(period: Period): KLinePeriod {
    const mapping: Record<Period, KLinePeriod> = {
      [Period.One]: KLinePeriod.ONE_MIN,
      [Period.FIVE]: KLinePeriod.FIVE_MIN,
      [Period.FIFTEEN]: KLinePeriod.FIFTEEN_MIN,
      [Period.THIRTY]: KLinePeriod.THIRTY_MIN,
      [Period.SIXTY]: KLinePeriod.SIXTY_MIN,
      [Period.DAY]: KLinePeriod.DAILY,
      [Period.WEEK]: KLinePeriod.WEEKLY,
      [Period.MONTH]: KLinePeriod.MONTHLY,
      [Period.QUARTER]: KLinePeriod.QUARTERLY,
      [Period.YEAR]: KLinePeriod.YEARLY,
    };
    return mapping[period];
  }

  async getCollectionStatus(
    stockCode: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    hasData: boolean;
    recordCount: number;
    lastRecord?: Date;
    firstRecord?: Date;
  }> {
    const kLinePeriod = this.convertPeriodToKLinePeriod(period);

    const result = await this.kLineRepository
      .createQueryBuilder('kline')
      .leftJoin('kline.stock', 'stock')
      .select('COUNT(*)', 'count')
      .addSelect('MAX(kline.timestamp)', 'lastRecord')
      .addSelect('MIN(kline.timestamp)', 'firstRecord')
      .where('stock.code = :stockCode', { stockCode })
      .andWhere('kline.period = :period', { period: kLinePeriod })
      .andWhere('kline.timestamp >= :startDate', { startDate })
      .andWhere('kline.timestamp <= :endDate', { endDate })
      .getRawOne();

    return {
      hasData: result.count > 0,
      recordCount: parseInt(result.count),
      lastRecord: result.lastRecord ? new Date(result.lastRecord) : undefined,
      firstRecord: result.firstRecord
        ? new Date(result.firstRecord)
        : undefined,
    };
  }

  async removeDuplicateData(
    stockCode: string,
    period: Period,
  ): Promise<number> {
    const kLinePeriod = this.convertPeriodToKLinePeriod(period);

    // Find duplicates by grouping by timestamp
    const duplicateQuery = this.kLineRepository
      .createQueryBuilder('kline')
      .leftJoin('kline.stock', 'stock')
      .select('kline.timestamp', 'timestamp')
      .addSelect('COUNT(*)', 'count')
      .where('stock.code = :stockCode', { stockCode })
      .andWhere('kline.period = :period', { period: kLinePeriod })
      .groupBy('kline.timestamp')
      .having('COUNT(*) > 1')
      .getRawMany();

    const duplicates = await duplicateQuery;

    if (duplicates.length === 0) {
      return 0;
    }

    const timestamps = duplicates.map((d) => d.timestamp);

    // Keep only the latest record for each timestamp (based on create_time)
    const deleteResult = await this.kLineRepository
      .createQueryBuilder()
      .delete()
      .from(KLine)
      .leftJoin('kline.stock', 'stock')
      .where('stock.code = :stockCode', { stockCode })
      .andWhere('period = :period', { period: kLinePeriod })
      .andWhere('timestamp IN (:...timestamps)', { timestamps })
      .andWhere(
        'id NOT IN (SELECT id FROM (SELECT id FROM k_lines k1 WHERE k1.stock.code = :stockCode AND k1.period = :period AND k1.timestamp IN (:...timestamps) ORDER BY k1.create_time DESC LIMIT 1) AS latest)',
      )
      .execute();

    return deleteResult.affected || 0;
  }
}
