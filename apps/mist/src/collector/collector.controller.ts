import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CollectorService } from './collector.service';
import { CollectKLineDto, CollectKLineResponse } from './dto/collect-kline.dto';
import { Period } from '../chan/enums/period.enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';

@ApiTags('data-collector')
@Controller('data-collector')
export class CollectorController {
  constructor(private readonly collectorService: CollectorService) {}

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Collect K-line data for a stock' })
  @ApiResponse({
    status: 200,
    description: 'K-line data successfully collected',
    type: CollectKLineResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async collectKLine(
    @Body() collectKLineDto: CollectKLineDto,
  ): Promise<CollectKLineResponse> {
    try {
      const { code, period, startDate, endDate } = collectKLineDto;

      // Parse dates
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : new Date();

      // Validate date range
      if (start >= end) {
        throw new BadRequestException('Start date must be before end date');
      }

      // Collect data
      await this.collectorService.collectKLine(code, period, start, end);

      // Get collection status
      const status = await this.collectorService.getCollectionStatus(
        code,
        period,
        start,
        end,
      );

      return {
        success: true,
        code: 200,
        message: 'SUCCESS',
        recordCount: status.recordCount,
        data: status,
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    } catch (error) {
      return {
        success: false,
        code:
          error instanceof BadRequestException
            ? 1001
            : error instanceof NotFoundException
              ? 1002
              : 5000,
        message: error.message,
        recordCount: 0,
        data: {
          hasData: false,
          recordCount: 0,
        },
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    }
  }

  @Get('status/:code/:period')
  @ApiOperation({ summary: 'Get collection status for a stock and period' })
  @ApiParam({ name: 'code', description: 'Stock code' })
  @ApiParam({ name: 'period', description: 'K-line period', enum: Period })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async getCollectionStatus(
    @Param('code') code: string,
    @Param('period') period: Period,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : new Date();

      if (start >= end) {
        throw new BadRequestException('Start date must be before end date');
      }

      const status = await this.collectorService.getCollectionStatus(
        code,
        period,
        start,
        end,
      );

      return {
        success: true,
        code: 200,
        message: 'SUCCESS',
        data: status,
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    } catch (error) {
      return {
        success: false,
        code:
          error instanceof BadRequestException
            ? 1001
            : error instanceof NotFoundException
              ? 1002
              : 5000,
        message: error.message,
        data: {
          hasData: false,
          recordCount: 0,
        },
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    }
  }

  @Post('remove-duplicates/:code/:period')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove duplicate data for a stock and period' })
  @ApiParam({ name: 'code', description: 'Stock code' })
  @ApiParam({ name: 'period', description: 'K-line period', enum: Period })
  @ApiResponse({ status: 200, description: 'Duplicates removed successfully' })
  @ApiResponse({ status: 404, description: 'Stock not found' })
  async removeDuplicates(
    @Param('code') code: string,
    @Param('period') period: Period,
  ) {
    try {
      const removedCount = await this.collectorService.removeDuplicateData(
        code,
        period,
      );

      return {
        success: true,
        code: 200,
        message: 'SUCCESS',
        data: {
          removedCount,
        },
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    } catch (error) {
      return {
        success: false,
        code:
          error instanceof BadRequestException
            ? 1001
            : error instanceof NotFoundException
              ? 1002
              : 5000,
        message: error.message,
        data: {
          removedCount: 0,
        },
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };
    }
  }

  private generateRequestId(): string {
    return `collector-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
