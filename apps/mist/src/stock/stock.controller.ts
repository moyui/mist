import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSourceDto } from './dto/add-source.dto';
import { Stock } from './stock.entity';

@ApiTags('stocks')
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize a new stock' })
  @ApiResponse({
    status: 201,
    description: 'Stock successfully initialized',
    type: Stock,
  })
  @ApiResponse({ status: 409, description: 'Stock already exists' })
  async initStock(@Body() initStockDto: InitStockDto): Promise<Stock> {
    return await this.stockService.initStock(initStockDto);
  }

  @Post('add-source')
  @ApiOperation({ summary: 'Add or update data source for an existing stock' })
  @ApiResponse({
    status: 200,
    description: 'Source successfully updated',
    type: Stock,
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async addSource(@Body() addSourceDto: AddSourceDto): Promise<Stock> {
    return await this.stockService.addSource(addSourceDto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get stock by code' })
  @ApiParam({
    name: 'code',
    description: 'Stock code (e.g., 000001.SH, 399006.SZ)',
  })
  @ApiResponse({ status: 200, description: 'Stock found', type: Stock })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async getStock(@Param('code') code: string): Promise<Stock> {
    return await this.stockService.findByCode(code);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active stocks' })
  @ApiResponse({
    status: 200,
    description: 'List of all active stocks',
    type: [Stock],
  })
  async getAllStocks(): Promise<Stock[]> {
    return await this.stockService.findAll();
  }

  @Put(':code/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a stock' })
  @ApiParam({ name: 'code', description: 'Stock code to deactivate' })
  @ApiResponse({ status: 200, description: 'Stock successfully deactivated' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async deactivateStock(@Param('code') code: string): Promise<void> {
    await this.stockService.deactivateStock(code);
  }

  @Put(':code/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a deactivated stock' })
  @ApiParam({ name: 'code', description: 'Stock code to activate' })
  @ApiResponse({ status: 200, description: 'Stock successfully activated' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async activateStock(@Param('code') code: string): Promise<void> {
    await this.stockService.activateStock(code);
  }

  @Get(':code/source')
  @ApiOperation({ summary: 'Get source configuration for a stock' })
  @ApiParam({ name: 'code', description: 'Stock code' })
  @ApiResponse({
    status: 200,
    description: 'Source configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async getSource(@Param('code') code: string) {
    return await this.stockService.getSourceFormat(code);
  }
}
