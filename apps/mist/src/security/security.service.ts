import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Security,
  SecuritySourceConfig,
  SecurityStatus,
} from '@app/shared-data';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
  ) {}

  formatCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async initStock(initStockDto: InitStockDto): Promise<Security> {
    const formattedCode = this.formatCode(initStockDto.code);

    const existingStock = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (existingStock) {
      throw new ConflictException(
        `Stock with code ${formattedCode} already exists`,
      );
    }

    // Create security
    const stock = this.securityRepository.create({
      code: formattedCode,
      name: initStockDto.name || '',
      type: initStockDto.type,
      status: SecurityStatus.ACTIVE,
    });

    return await this.securityRepository.save(stock);
  }

  async addSource(addSourceDto: AddSourceDto): Promise<Security> {
    const formattedCode = this.formatCode(addSourceDto.code);

    const stock = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }

    const sourceConfig = this.sourceConfigRepository.create({
      security: stock,
      source: addSourceDto.source,
      formatCode: addSourceDto.formatCode || '',
      priority: addSourceDto.priority ?? 0,
      enabled: addSourceDto.enabled ?? true,
    });
    await this.sourceConfigRepository.save(sourceConfig);

    return stock;
  }

  async findByCode(code: string): Promise<Security> {
    const formattedCode = this.formatCode(code);

    const stock = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }

    return stock;
  }

  async getSourceFormat(
    code: string,
  ): Promise<{ type: string; config?: string }> {
    const stock = await this.findByCode(code);

    // Get source configs for this security
    const sourceConfigs = await this.sourceConfigRepository.find({
      where: { security: { id: stock.id } },
      relations: ['security'],
    });

    if (sourceConfigs.length === 0) {
      return {
        type: 'none',
        config: undefined,
      };
    }

    // Return the first (highest priority) source config
    const config = sourceConfigs[0];
    return {
      type: config.source,
      config: config.formatCode,
    };
  }

  async findAll(): Promise<Security[]> {
    return await this.securityRepository.find({
      order: { code: 'ASC' },
    });
  }

  /**
   * Get all active securities for scheduled collection.
   *
   * Returns array of security codes that have ACTIVE status.
   * Used by the scheduler to determine which securities to collect data for.
   *
   * @returns Array of active security codes
   */
  async getActiveSecurities(): Promise<string[]> {
    const securities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
      select: ['code'],
      order: { code: 'ASC' },
    });

    return securities.map((s) => s.code);
  }

  async deactivateStock(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const result = await this.securityRepository.update(
      { code: formattedCode },
      { status: SecurityStatus.SUSPENDED }, // Suspended
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }
  }

  async activateStock(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const result = await this.securityRepository.update(
      { code: formattedCode },
      { status: SecurityStatus.ACTIVE }, // Active
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }
  }
}
