import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketDataBar, Security, KPeriod, DataSource } from '@app/shared-data';
import {
  ISourceFetcher,
  KLineFetchParams,
  KLineData,
} from './interfaces/source-fetcher.interface';
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
import { Period } from '../chan/enums/period.enum';

@Injectable()
export class DataCollectorService {
  private sources: Map<DataSource, ISourceFetcher> = new Map();

  constructor(
    @InjectRepository(MarketDataBar)
    private readonly marketDataBarRepository: Repository<MarketDataBar>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
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
      // Validate security exists
      const security = await this.securityRepository.findOne({
        where: { code: stockCode },
      });

      if (!security) {
        throw new NotFoundException(
          `Security with code ${stockCode} not found`,
        );
      }

      // Default to East Money data source
      const dataSource = DataSource.EAST_MONEY;
      const sourceFetcher = this.sources.get(dataSource);
      if (!sourceFetcher) {
        throw new BadRequestException(
          `Data source ${dataSource} is not available`,
        );
      }

      // Check if period is supported
      if (!sourceFetcher.isSupportedPeriod(period)) {
        throw new BadRequestException(
          `Period ${period} is not supported by data source ${dataSource}`,
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
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return;
      }

      // Save data to database
      await this.saveKLineData(security, kLineData, dataSource, period);

      console.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period}`,
      );
    } catch (error) {
      console.error(`Failed to collect K-line data for ${stockCode}:`, error);
      throw error;
    }
  }

  private async saveKLineData(
    security: Security,
    kLineData: KLineData[],
    dataSource: DataSource,
    period: Period,
  ): Promise<void> {
    const marketDataBarEntities = kLineData.map((data) => {
      const bar = this.marketDataBarRepository.create({
        security,
        source: dataSource,
        period: this.convertPeriodToBarPeriod(period),
        timestamp: data.timestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: BigInt(Math.round(data.volume)),
        amount: data.amount || 0,
      });

      return bar;
    });

    await this.marketDataBarRepository.save(marketDataBarEntities);
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

  private convertPeriodToBarPeriod(period: Period): KPeriod {
    const mapping: Record<Period, KPeriod> = {
      [Period.One]: KPeriod.ONE_MIN,
      [Period.FIVE]: KPeriod.FIVE_MIN,
      [Period.FIFTEEN]: KPeriod.FIFTEEN_MIN,
      [Period.THIRTY]: KPeriod.THIRTY_MIN,
      [Period.SIXTY]: KPeriod.SIXTY_MIN,
      [Period.DAY]: KPeriod.DAILY,
      // Note: KPeriod enum only supports up to daily periods
      // Weekly, monthly, quarterly, yearly periods are not supported
      [Period.WEEK]: KPeriod.DAILY, // Fallback to daily
      [Period.MONTH]: KPeriod.DAILY, // Fallback to daily
      [Period.QUARTER]: KPeriod.DAILY, // Fallback to daily
      [Period.YEAR]: KPeriod.DAILY, // Fallback to daily
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
    const barPeriod = this.convertPeriodToBarPeriod(period);

    const result = await this.marketDataBarRepository
      .createQueryBuilder('bar')
      .leftJoin('bar.security', 'security')
      .select('COUNT(*)', 'count')
      .addSelect('MAX(bar.timestamp)', 'lastRecord')
      .addSelect('MIN(bar.timestamp)', 'firstRecord')
      .where('security.code = :stockCode', { stockCode })
      .andWhere('bar.period = :period', { period: barPeriod })
      .andWhere('bar.timestamp >= :startDate', { startDate })
      .andWhere('bar.timestamp <= :endDate', { endDate })
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
    const barPeriod = this.convertPeriodToBarPeriod(period);

    // Find duplicates by grouping by timestamp
    const duplicateQuery = this.marketDataBarRepository
      .createQueryBuilder('bar')
      .leftJoin('bar.security', 'security')
      .select('bar.timestamp', 'timestamp')
      .addSelect('COUNT(*)', 'count')
      .where('security.code = :stockCode', { stockCode })
      .andWhere('bar.period = :period', { period: barPeriod })
      .groupBy('bar.timestamp')
      .having('COUNT(*) > 1')
      .getRawMany();

    const duplicates = await duplicateQuery;

    if (duplicates.length === 0) {
      return 0;
    }

    const timestamps = duplicates.map((d) => d.timestamp);

    // Keep only the latest record for each timestamp (based on created_at)
    const deleteResult = await this.marketDataBarRepository
      .createQueryBuilder()
      .delete()
      .from(MarketDataBar)
      .where('bar.security.code = :stockCode', { stockCode })
      .andWhere('bar.period = :period', { period: barPeriod })
      .andWhere('bar.timestamp IN (:...timestamps)', { timestamps })
      .andWhere(
        'bar.id NOT IN (SELECT id FROM (SELECT id FROM market_data_bars b1 WHERE b1.security.code = :stockCode AND b1.period = :period AND b1.timestamp IN (:...timestamps) ORDER BY b1.created_at DESC LIMIT 1) AS latest)',
      )
      .execute();

    return deleteResult.affected || 0;
  }
}
