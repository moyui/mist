import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';

@Injectable()
export class DataSourceService {
  private readonly defaultSource: DataSource;

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    const envDefault = this.configService.get<string>('DEFAULT_DATA_SOURCE');

    // Validate and set default source
    // Accept either enum value ('ef') or normalized enum key ('EAST_MONEY')
    if (envDefault) {
      const normalized = this.normalize(envDefault);
      this.defaultSource = this.selectOrFail(normalized);
    } else {
      // Fallback to EAST_MONEY if not specified
      this.defaultSource = DataSource.EAST_MONEY;
    }
  }

  /**
   * Select data source with fallback to default
   * Accepts: enum value ('ef'), enum key ('EAST_MONEY'), or user-friendly ('east-money')
   */
  select(source?: string): DataSource {
    if (!source) {
      return this.defaultSource;
    }

    return this.selectOrFail(source);
  }

  /**
   * Select data source or throw error
   * @throws Error if source is invalid
   */
  private selectOrFail(source: string): DataSource {
    const normalized = this.normalize(source);

    // First try as enum value (e.g., 'ef', 'tdx', 'mqmt')
    const enumValues = Object.values(DataSource);
    if (enumValues.includes(source as DataSource)) {
      return source as DataSource;
    }

    // Then try as enum key (e.g., 'EAST_MONEY', 'TDX', 'MINI_QMT')
    const enumKey = normalized.toUpperCase();
    const dataSource = enumKey as keyof typeof DataSource;
    if (DataSource[dataSource]) {
      return DataSource[dataSource];
    }

    // Not found
    throw new Error(
      `Invalid data source: ${source}. Supported values: ${enumValues.join(', ')} or keys: ${Object.keys(DataSource).join(', ')}`,
    );
  }

  /**
   * Normalize source name to enum key format
   * Supports: east-money, EAST_MONEY, east_money, eastMoney → EAST_MONEY
   */
  normalize(source: string): string {
    return source.toUpperCase().replace(/-/g, '_');
  }

  /**
   * Validate if source is supported (returns boolean)
   */
  isValid(source: string): boolean {
    try {
      this.selectOrFail(source);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configured default data source
   */
  getDefault(): DataSource {
    return this.defaultSource;
  }
}
