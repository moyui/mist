import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, SecuritySourceConfig, DataSource } from '@app/shared-data';
import { DataSourceService } from './data-source.service';

/**
 * Shared service for data source selection (方案B)
 *
 * Used by both CollectorService and DataCollectionScheduler to avoid DRY violation
 */
@Injectable()
export class DataSourceSelectionService {
  constructor(
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
    private readonly dataSourceService: DataSourceService,
  ) {}

  /**
   * Get data source for a security
   * Priority: SecuritySourceConfig (highest enabled priority) > Global Default
   *
   * @param security Security object
   * @returns Selected data source
   */
  async getDataSourceForSecurity(security: Security): Promise<DataSource> {
    // Query SecuritySourceConfig for this security
    const configs = await this.sourceConfigRepository.find({
      where: {
        security: { id: security.id },
        enabled: true,
      },
      relations: ['security'],
      order: {
        priority: 'DESC', // Highest priority first
      },
    });

    // If config exists, return highest priority source
    if (configs.length > 0) {
      return configs[0].source;
    }

    // Fall back to global default
    return this.dataSourceService.getDefault();
  }
}
