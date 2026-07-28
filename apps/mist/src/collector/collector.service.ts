import { DataSource, Period, Security } from '@app/shared-data';
import { DataSourceSelectionService, getSecurityFormatCode } from '@app/utils';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import { KData, KFetchParams } from '../sources/source-fetcher.interface';
import { QmtSource } from '../sources/qmt/qmt-source.service';
import { QmtResponse } from '../sources/qmt/types';
import { TdxSource } from '../sources/tdx/tdx-source.service';
import { TdxResponse } from '../sources/tdx/types';

type SourceFetcher = EastMoneySource | TdxSource | QmtSource;

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);
  private sources: Map<DataSource, SourceFetcher> = new Map();

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly eastMoneySource: EastMoneySource,
    private readonly tdxSource: TdxSource,
    private readonly qmtSource: QmtSource,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
  ) {
    this.registerDataSources();
  }

  private registerDataSources(): void {
    this.sources.set(DataSource.EAST_MONEY, this.eastMoneySource);
    this.sources.set(DataSource.TDX, this.tdxSource);
    this.sources.set(DataSource.QMT, this.qmtSource);
  }

  /**
   * Get data source for a security (方案B: Security-level configuration)
   * Uses shared DataSourceSelectionService to avoid DRY violation
   */
  private async getSourceForSecurity(security: Security): Promise<DataSource> {
    return this.dataSourceSelectionService.getDataSourceForSecurity(security);
  }

  private async saveFetchedKData(
    sourceFetcher: SourceFetcher,
    kLineData: KData[] | TdxResponse[] | QmtResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (sourceFetcher instanceof TdxSource) {
      await sourceFetcher.saveK(kLineData as TdxResponse[], security, period);
      return;
    }

    if (sourceFetcher instanceof QmtSource) {
      await sourceFetcher.saveK(kLineData as QmtResponse[], security, period);
      return;
    }

    await sourceFetcher.saveK(kLineData as KData[], security, period);
  }

  private toPostProcessKData(
    kLineData: Array<KData | TdxResponse | QmtResponse>,
    period: Period,
  ): KData[] {
    return kLineData.map((item) =>
      'period' in item ? item : { ...item, period },
    ) as KData[];
  }

  /**
   * Collect K-line data for a specific data source (for scheduler use).
   *
   * This method allows explicit data source selection and supports post-processing
   * callbacks for additional data transformation after collection.
   *
   * @param stockCode - Security code
   * @param period - Time period
   * @param startDate - Start date
   * @param endDate - End date
   * @param dataSource - Specific data source to use
   * @param postProcess - Optional callback for post-processing collected data
   */
  async collectKForSource(
    stockCode: string,
    period: Period,
    startDate: Date,
    endDate: Date,
    dataSource: DataSource,
    postProcess?: (data: KData[], source: DataSource) => Promise<void>,
  ): Promise<number> {
    try {
      // Validate security exists
      const security = await this.findSecurityByCode(stockCode);
      if (!security) {
        throw new NotFoundException(
          `Security with code ${stockCode} not found`,
        );
      }

      // Get the source fetcher for the specified data source
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
      const fetchParams: KFetchParams = {
        code: stockCode,
        formatCode: getSecurityFormatCode(security, dataSource),
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchK(fetchParams);

      if (kLineData.length === 0) {
        this.logger.warn(
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return 0;
      }

      // Save data to database
      await this.saveFetchedKData(sourceFetcher, kLineData, security, period);

      // Call post-process callback if provided
      if (postProcess) {
        await postProcess(
          this.toPostProcessKData(kLineData, period),
          dataSource,
        );
      }

      this.logger.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period} from ${dataSource}`,
      );
      return kLineData.length;
    } catch (error) {
      this.logger.error(
        `Failed to collect K-line data for ${stockCode} from ${dataSource}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Save raw K-line data to database (for WebSocket streaming use).
   *
   * This method is optimized for real-time data streaming where data arrives
   * incrementally and needs to be saved immediately.
   *
   * @param security - Security entity
   * @param kLineData - Array of raw K-line data
   * @param dataSource - Data source
   * @param period - Time period
   */
  async saveRawKData(
    security: Security,
    kLineData: KData[],
    dataSource: DataSource,
    period: Period,
  ): Promise<void> {
    const sourceFetcher = this.sources.get(dataSource);
    if (!sourceFetcher) {
      throw new BadRequestException(
        `Data source ${dataSource} is not available`,
      );
    }
    await this.saveFetchedKData(sourceFetcher, kLineData, security, period);
  }

  /**
   * Find security by code.
   *
   * @param code - Security code
   * @returns Security entity or null if not found
   */
  async findSecurityByCode(code: string): Promise<Security | null> {
    return this.securityRepository.findOne({
      where: { code },
      relations: ['sourceConfigs'],
    });
  }

  async collectK(
    stockCode: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    try {
      // Validate security exists
      const security = await this.securityRepository.findOne({
        where: { code: stockCode },
        relations: ['sourceConfigs'],
      });

      if (!security) {
        throw new NotFoundException(
          `Security with code ${stockCode} not found`,
        );
      }

      // Use configured data source instead of hardcoded EAST_MONEY
      const dataSource = await this.getSourceForSecurity(security);
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
      const fetchParams: KFetchParams = {
        code: stockCode,
        formatCode: getSecurityFormatCode(security, dataSource),
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchK(fetchParams);

      if (kLineData.length === 0) {
        this.logger.warn(
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return;
      }

      // Save data to database
      await this.saveFetchedKData(sourceFetcher, kLineData, security, period);

      this.logger.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect K-line data for ${stockCode}:`,
        error,
      );
      throw error;
    }
  }
}
