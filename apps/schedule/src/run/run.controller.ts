import { PeriodType, SharedDataService } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { UtilsService } from '@app/utils';
import { Controller, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TaskService } from '../task/task.service';

@Controller('run')
export class RunController implements OnApplicationBootstrap {
  private symbol = '000300'; // 上证指数接口有问题，先用hs300代替
  private isTradingDay = false;

  constructor(private readonly sharedDataService: SharedDataService) {}

  @Inject()
  private taskService: TaskService;

  @Inject()
  private timezoneService: TimezoneService;

  @Inject()
  private utilsService: UtilsService;

  onApplicationBootstrap() {
    this.handleCronIsTradingDay();
    this.handleCron1MinIndex();
    this.handleCron5MinIndex();
    this.handleCron15MinIndex();
    this.handleCron30MinIndex();
    this.handleCron60MinIndex();
  }

  async handleCron1MinIndex() {
    // 取数时间段 9:32～11:31 || 13:01~15:01 因为32分才能取到第31分的数据，30分的数据无效
    this.taskService.addCronJob('callIndex1Mins', '*/1 * * * *', async () => {
      const time = this.utilsService.getNowDate();
      if (!this.timezoneService.isInTime1Min(time)) return;
      if (!this.isTradingDay) return;
      return await this.sharedDataService.cronIndexPeriod({
        symbol: this.symbol,
        periodType: PeriodType.One,
        time: time,
      });
    });
  }

  async handleCron5MinIndex() {
    // 取数时间段 9:36～11:31 || 13:06~15:01
    this.taskService.addCronJob('callIndex5Mins', '1/5 * * * *', async () => {
      const time = this.utilsService.getNowDate();

      if (!this.timezoneService.isInTime5Min(time)) return;
      if (!this.isTradingDay) return;
      return await this.sharedDataService.cronIndexPeriod({
        symbol: this.symbol,
        periodType: PeriodType.FIVE,
        time: time,
      });
    });
  }

  async handleCron15MinIndex() {
    // 取数时间段 9:46～11:31 || 13:16~15:01
    this.taskService.addCronJob('callIndex15Mins', '1/15 * * * *', async () => {
      const time = this.utilsService.getNowDate();
      if (!this.timezoneService.isInTime15Min(time)) return;
      if (!this.isTradingDay) return;
      return await this.sharedDataService.cronIndexPeriod({
        symbol: this.symbol,
        periodType: PeriodType.FIFTEEN,
        time: time,
      });
    });
  }

  async handleCron30MinIndex() {
    // 取数时间段 10:01～11:31 || 13:31~15:01
    this.taskService.addCronJob('callIndex30Mins', '1/30 * * * *', async () => {
      const time = this.utilsService.getNowDate();
      if (!this.timezoneService.isInTime30Min(time)) return;
      if (!this.isTradingDay) return;
      return await this.sharedDataService.cronIndexPeriod({
        symbol: this.symbol,
        periodType: PeriodType.THIRTY,
        time: time,
      });
    });
  }

  async handleCron60MinIndex() {
    // 取数时间段 10:31～11:31 || 14:01~15:01
    const task = async () => {
      const time = this.utilsService.getNowDate();
      if (!this.isTradingDay) return;
      return await this.sharedDataService.cronIndexPeriod({
        symbol: this.symbol,
        periodType: PeriodType.SIXTY,
        time: time,
      });
    };
    this.taskService.addCronJob('callIndex60Mins1031', '31 10 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1131', '31 11 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1401', '01 14 * * *', task);
    this.taskService.addCronJob('callIndex60Mins1501', '01 15 * * *', task);
  }

  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  async handleCronDailyIndex() {
    if (!this.isTradingDay) return;
    this.sharedDataService.cronIndexDaily(
      {
        symbol: this.symbol,
        code: 'sh',
        startDate: this.utilsService.getNowDate(),
        endDate: this.utilsService.getNowDate(),
      },
      false,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleCronIsTradingDay() {
    this.isTradingDay = await this.timezoneService.isTradingDay(
      this.utilsService.getNowDate(),
    );
  }
}
