import {
  Body,
  Controller,
  Get,
  Inject,
  OnApplicationBootstrap,
  Post,
  Query,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskService } from 'src/task/task.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { getNowDate } from 'src/utils';
import { DataService } from './data.service';
import { CronIndexDailyDto } from './dto/cron-index-daily.dto';
import { Type as IndexPeriodType } from './entities/index-period.entity';
import { CronIndexPeriodDto } from './dto/cron-index-period.dto';

@Controller('data')
export class DataController implements OnApplicationBootstrap {
  private static symbol = '000300'; // 上证指数接口有问题，先用hs300代替

  constructor(private readonly dataService: DataService) {
    // 初始化上证指数
    this.dataService.initData();
  }

  // 尽量晚上启动，不要影响到开盘时间
  onApplicationBootstrap() {
    // 这个函数会在所有模块加载完成后调用
    this.handleCron1MinIndex();
    this.handleCron5MinIndex();
    this.handleCron15MinIndex();
    this.handleCron30MinIndex();
    this.handleCron60MinIndex();
  }

  @Inject()
  private taskService: TaskService;

  @Inject()
  private timezoneService: TimezoneService;

  @Get('index')
  async getIndex() {
    return this.dataService.index();
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
    return this.dataService.cronIndexPeriod({
      symbol: indexPeriodDto.symbol,
      time: new Date(indexPeriodDto.time), // 这个当前时间采集的是前1分钟的时间，注意
      periodType: indexPeriodDto.periodType,
    });
  }

  @Post('index-daily')
  async postIndexDaily(@Body() indexDailyDto: CronIndexDailyDto) {
    return this.dataService.cronIndexDaily(
      {
        symbol: indexDailyDto.symbol,
        code: indexDailyDto.code,
        startDate: new Date(indexDailyDto.startDate),
        endDate: new Date(indexDailyDto.endDate),
      },
      false,
    );
  }

  async handleCron1MinIndex() {
    // 取数时间段 9:32～11:31 || 13:01~15:01 因为32分才能取到第31分的数据，30分的数据无效
    this.taskService.addCronJob('callIndex1Mins', '*/1 * * * *', async () => {
      const time = getNowDate();
      if (!this.timezoneService.isInTime1Min(time)) return;
      return await this.dataService.cronIndexPeriod({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.One,
        time: time,
      });
    });
  }

  async handleCron5MinIndex() {
    // 取数时间段 9:36～11:31 || 13:06~15:01
    this.taskService.addCronJob('callIndex5Mins', '1/5 * * * *', async () => {
      const time = getNowDate();
      if (!this.timezoneService.isInTime5Min(time)) return;
      return await this.dataService.cronIndexPeriod({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.FIVE,
        time: time,
      });
    });
  }

  async handleCron15MinIndex() {
    // 取数时间段 9:46～11:31 || 13:16~15:01
    this.taskService.addCronJob('callIndex15Mins', '1/15 * * * *', async () => {
      const time = getNowDate();
      if (!this.timezoneService.isInTime15Min(time)) return;
      return await this.dataService.cronIndexPeriod({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.FIFTEEN,
        time: time,
      });
    });
  }

  async handleCron30MinIndex() {
    // 取数时间段 10:01～11:31 || 13:31~15:01
    this.taskService.addCronJob('callIndex30Mins', '1/30 * * * *', async () => {
      const time = getNowDate();
      if (!this.timezoneService.isInTime30Min(time)) return;
      return await this.dataService.cronIndexPeriod({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.THIRTY,
        time: time,
      });
    });
  }

  async handleCron60MinIndex() {
    // 取数时间段 10:31～11:31 || 14:01~15:01
    const task = async () => {
      const time = getNowDate();
      return await this.dataService.cronIndexPeriod({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.SIXTY,
        time: time,
      });
    };
    this.taskService.addCronJob('callIndex60Mins1031', '31 10 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1131', '31 11 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1401', '01 14 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1501', '01 15 * * *', task);
  }

  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  async handleDailyIndex() {
    this.dataService.cronIndexDaily(
      {
        symbol: DataController.symbol,
        code: 'sh',
        startDate: new Date(),
        endDate: new Date(),
      },
      false,
    );
  }
}
