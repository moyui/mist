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
  SecurityType,
  SecurityStatus,
} from '@app/shared-data';
import { CollectorService } from '../collector/collector.service';
import { InitStockDto, StockType } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { Period } from '../chan/enums/period.enum';

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(SecuritySourceConfig)
    private readonly sourceConfigRepository: Repository<SecuritySourceConfig>,
    private readonly collectorService: CollectorService,
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

    // Convert DTO StockType to entity SecurityType
    const securityType = this.convertStockType(initStockDto.type);

    // Create security
    const stock = this.securityRepository.create({
      code: formattedCode,
      name: initStockDto.name || '',
      type: securityType,
      exchange: this.extractExchange(formattedCode),
      status: SecurityStatus.ACTIVE,
    });

    const savedStock = await this.securityRepository.save(stock);

    // Call CollectorService to collect historical data for first period
    if (initStockDto.periods && initStockDto.periods.length > 0) {
      const period = this.mapMinutesToPeriod(initStockDto.periods[0]);
      await this.collectorService.collectKLine(
        formattedCode,
        period,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        new Date(),
      );
    }

    return savedStock;
  }

  private convertStockType(stockType: StockType): SecurityType {
    // Convert DTO enum to entity enum
    // Both use 'stock' and 'index' but entity uses uppercase
    return stockType === StockType.INDEX
      ? SecurityType.INDEX
      : SecurityType.STOCK;
  }

  private extractExchange(code: string): string {
    if (code.endsWith('.SH') || code.startsWith('6')) {
      return 'SH';
    } else if (
      code.endsWith('.SZ') ||
      code.startsWith('0') ||
      code.startsWith('3')
    ) {
      return 'SZ';
    } else if (code.startsWith('5')) {
      return 'CSI';
    }
    return 'SH'; // Default
  }

  private mapMinutesToPeriod(minutes: number): Period {
    const mapping: Record<number, Period> = {
      1: Period.One,
      5: Period.FIVE,
      15: Period.FIFTEEN,
      30: Period.THIRTY,
      60: Period.SIXTY,
      1440: Period.DAY,
    };
    return mapping[minutes] || Period.FIVE; // Default to 5min
  }

  async addSource(addSourceDto: AddSourceDto): Promise<Security> {
    const formattedCode = this.formatCode(addSourceDto.code);

    const stock = await this.securityRepository.findOne({
      where: { code: formattedCode },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }

    // Note: Source configuration is now handled via SecuritySourceConfig entity
    // This method can be extended to create source config entries
    // For now, it returns the stock without modification

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
