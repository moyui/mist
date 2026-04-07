import {
  DataSource,
  Period,
  Security,
  SecuritySourceConfig,
} from '@app/shared-data';
import { DataSourceSelectionService } from '@app/utils';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import {
  ISourceFetcher,
  KData,
  KFetchParams,
} from '../sources/source-fetcher.interface';
import { TdxSource } from '../sources/tdx/tdx-source.service';

@Injectable()
export class CollectorService {
  private sources: Map<DataSource, ISourceFetcher> = new Map();

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly eastMoneySource: EastMoneySource,
    private readonly tdxSource: TdxSource,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
  ) {
    this.registerDataSources();
  }

  private registerDataSources(): void {
    this.sources.set(DataSource.EAST_MONEY, this.eastMoneySource);
    this.sources.set(DataSource.TDX, this.tdxSource);
  }

  private getFormatCode(security: Security, dataSource: DataSource): string {
    const config = security.sourceConfigs?.find(
      (c: SecuritySourceConfig) => c.source === dataSource && c.enabled,
    );
    return config?.formatCode || security.code;
  }

  /**
   * Get data source for a security (方案B: Security-level configuration)
   * Uses shared DataSourceSelectionService to avoid DRY violation
   */
  private async getSourceForSecurity(security: Security): Promise<DataSource> {
    return this.dataSourceSelectionService.getDataSourceForSecurity(security);
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
        formatCode: this.getFormatCode(security, dataSource),
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchK(fetchParams);

      if (kLineData.length === 0) {
        console.warn(
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return 0;
      }

      // Save data to database
      await sourceFetcher.saveK(kLineData, security, period);

      // Call post-process callback if provided
      if (postProcess) {
        await postProcess(kLineData, dataSource);
      }

      console.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period} from ${dataSource}`,
      );
      return kLineData.length;
    } catch (error) {
      console.error(
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
    await sourceFetcher.saveK(kLineData, security, period);
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
        formatCode: this.getFormatCode(security, dataSource),
        period,
        startDate,
        endDate,
      };

      const kLineData = await sourceFetcher.fetchK(fetchParams);

      if (kLineData.length === 0) {
        console.warn(
          `No data returned for security ${stockCode}, period ${period}, from ${startDate} to ${endDate}`,
        );
        return;
      }

      // Save data to database
      await sourceFetcher.saveK(kLineData, security, period);

      console.log(
        `Successfully collected ${kLineData.length} K-line records for ${stockCode}, period ${period}`,
      );
    } catch (error) {
      console.error(`Failed to collect K-line data for ${stockCode}:`, error);
      throw error;
    }
  }
}
