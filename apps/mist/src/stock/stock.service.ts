import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from './stock.entity';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  formatCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async initStock(initStockDto: InitStockDto): Promise<Stock> {
    const formattedCode = this.formatCode(initStockDto.code);

    const existingStock = await this.stockRepository.findOne({
      where: { code: formattedCode },
    });

    if (existingStock) {
      throw new ConflictException(
        `Stock with code ${formattedCode} already exists`,
      );
    }

    const stock = this.stockRepository.create({
      code: formattedCode,
      name: initStockDto.name,
      type: initStockDto.type,
      periods: initStockDto.periods || [1, 5, 15, 30, 60, 1440],
      source: {
        type: initStockDto.source.type,
        config: initStockDto.source.config,
      },
      isActive: true,
    });

    return await this.stockRepository.save(stock);
  }

  async addSource(addSourceDto: AddSourceDto): Promise<Stock> {
    const formattedCode = this.formatCode(addSourceDto.code);

    const stock = await this.stockRepository.findOne({
      where: { code: formattedCode },
    });

    if (!stock) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }

    // Update source configuration
    stock.source = {
      type: addSourceDto.source.type,
      config: addSourceDto.source.config,
    };

    // Update periods if provided
    if (addSourceDto.periods && addSourceDto.periods.length > 0) {
      stock.periods = addSourceDto.periods;
    }

    return await this.stockRepository.save(stock);
  }

  async findByCode(code: string): Promise<Stock> {
    const formattedCode = this.formatCode(code);

    const stock = await this.stockRepository.findOne({
      where: { code: formattedCode, isActive: true },
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
    return {
      type: stock.source.type,
      config: stock.source.config,
    };
  }

  async findAll(): Promise<Stock[]> {
    return await this.stockRepository.find({
      where: { isActive: true },
      order: { code: 'ASC' },
    });
  }

  async deactivateStock(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const result = await this.stockRepository.update(
      { code: formattedCode },
      { isActive: false },
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }
  }

  async activateStock(code: string): Promise<void> {
    const formattedCode = this.formatCode(code);

    const result = await this.stockRepository.update(
      { code: formattedCode },
      { isActive: true },
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Stock with code ${formattedCode} not found`);
    }
  }
}
