import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { Security } from '@app/shared-data';
import { SecurityService } from './security.service';
import { InitStockDto } from './dto/init-stock.dto';
import { AddSecuritySourceDto } from './dto/add-security-source.dto';

@ApiTags('security v1')
@Controller('security/v1')
@UseInterceptors(TransformInterceptor)
@UseFilters(AllExceptionsFilter)
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize a new stock' })
  @ApiResponse({
    status: 201,
    description: 'Stock successfully initialized',
    type: Security,
  })
  @ApiResponse({ status: 409, description: 'Stock already exists' })
  async initStock(@Body() initStockDto: InitStockDto): Promise<Security> {
    return await this.securityService.initStock(initStockDto);
  }

  @Post('add-source')
  @ApiOperation({ summary: 'Add or update data source for an existing stock' })
  @ApiResponse({
    status: 200,
    description: 'Source successfully updated',
    type: Security,
  })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async addSource(
    @Body() addSourceDto: AddSecuritySourceDto,
  ): Promise<Security> {
    return await this.securityService.addSource(addSourceDto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get stock by code' })
  @ApiParam({
    name: 'code',
    description: 'Stock code (e.g., 000001.SH, 399006.SZ)',
  })
  @ApiResponse({ status: 200, description: 'Stock found', type: Security })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async getStock(@Param('code') code: string): Promise<Security> {
    return await this.securityService.findByCode(code);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all active stocks' })
  @ApiResponse({
    status: 200,
    description: 'List of all active stocks',
    type: [Security],
  })
  async getAllStocks(): Promise<Security[]> {
    return await this.securityService.findAll();
  }

  @Put(':code/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a stock' })
  @ApiParam({ name: 'code', description: 'Stock code to deactivate' })
  @ApiResponse({ status: 200, description: 'Stock successfully deactivated' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async deactivateStock(@Param('code') code: string): Promise<void> {
    await this.securityService.deactivateStock(code);
  }

  @Put(':code/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a deactivated stock' })
  @ApiParam({ name: 'code', description: 'Stock code to activate' })
  @ApiResponse({ status: 200, description: 'Stock successfully activated' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async activateStock(@Param('code') code: string): Promise<void> {
    await this.securityService.activateStock(code);
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
    return await this.securityService.getSourceFormat(code);
  }
}
