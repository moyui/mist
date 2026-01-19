import {
  CronIndexDailyDto,
  CronIndexPeriodDto,
  SharedDataService,
} from '@app/shared-data';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { DataService } from './data.service';

@Controller('data')
export class DataController {
  @Inject()
  private sharedDataService: SharedDataService;

  constructor(private readonly dataService: DataService) {
    // 初始化上证指数
    this.dataService.initData();
  }

  @Get('index')
  async getIndex() {
    return await this.dataService.index();
  }

  @Get('index-period')
  async getIndexPeriod(
    @Query('symbol') symbol: string,
    @Query('period') period: number,
    @Query('startDate') startDateString: string,
    @Query('endDate') endDateString: string,
  ) {
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);
    return await this.dataService.findIndexPeriodById({
      symbol,
      period,
      startDate: startDate,
      endDate: endDate,
    });
  }

  @Get('index-daily')
  async getIndexDaily(
    @Query('symbol') symbol: string,
    @Query('code') code: string,
    @Query('startDate') startDateString: string,
    @Query('endDate') endDateString: string,
  ) {
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);
    return await this.dataService.findIndexDailyById({
      symbol,
      code,
      startDate: startDate,
      endDate: endDate,
    });
  }

  @Post('index-period')
  async postIndexPeriod(@Body() indexPeriodDto: CronIndexPeriodDto) {
    return await this.sharedDataService.cronIndexPeriod({
      symbol: indexPeriodDto.symbol,
      time: new Date(indexPeriodDto.time), // 这个当前时间采集的是前1分钟的时间，注意
      periodType: indexPeriodDto.periodType,
    });
  }

  @Post('index-daily')
  async postIndexDaily(@Body() indexDailyDto: CronIndexDailyDto) {
    return this.sharedDataService.cronIndexDaily(
      {
        symbol: indexDailyDto.symbol,
        code: indexDailyDto.code,
        startDate: new Date(indexDailyDto.startDate),
        endDate: new Date(indexDailyDto.endDate),
      },
      false,
    );
  }
}
