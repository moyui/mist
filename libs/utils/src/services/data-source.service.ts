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
      try {
        const normalized = this.normalize(envDefault);
        this.defaultSource = this.selectOrFail(normalized);
      } catch {
        console.warn(
          `Invalid DEFAULT_DATA_SOURCE "${envDefault}", falling back to EAST_MONEY`,
        );
        this.defaultSource = DataSource.EAST_MONEY;
      }
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

    // Trim whitespace to handle user input more gracefully
    const trimmed = source.trim();
    return this.selectOrFail(trimmed);
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
      `Invalid data source "${source}". Supported formats:
- Enum values: ${enumValues.join(', ')}
- Enum keys: ${Object.keys(DataSource).join(', ')}
- User-friendly: east-money, mini-qmt`,
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
