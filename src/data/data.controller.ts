import {
  Controller,
  Get,
  Inject,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { TaskService } from 'src/task/task.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { addZeroToNumber } from 'src/utils';
import { DataService } from './data.service';
import { Type as IndexPeriodType } from './entities/index-period.entity';
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
  async index() {
    // 生成时间段
    const startTime = new Date('2025-02-14T09:30:00');
    const endTime = new Date('2025-02-14T15:00:00');
    const intervalMinutes = 5;

    const parse = this.timezoneService.generateTimeSlots(
      startTime,
      endTime,
      intervalMinutes,
    );
    const test = {
      symbol: DataController.symbol,
      period: 5,
      startDate: parse[0][0],
      endDate: parse[0][1],
    };
    const data = await this.dataService.getIndex(test);

    const result = await this.dataService.saveData(
      {
        symbol: DataController.symbol,
        time: parse[0][0],
      },
      data[0],
      IndexPeriodType.FIVE,
    );
    return result;
  }

  @Get('time-test')
  async timeTest() {
    return this.timezoneService.convertToBeijingTimeWithInterval(
      new Date('2025-02-14T10:31:01'),
      'Asia/Shanghai',
      5,
    );
  }

  private getMockTime() {
    const localTime = new Date();
    // 模拟9点钟开盘注入数据
    const minutes = addZeroToNumber(localTime.getMinutes());
    const seconds = addZeroToNumber(localTime.getSeconds());
    // 假设当前时间
    const realTime = new Date(`2025-02-14T10:${minutes}:${seconds}`);
    return realTime;
  }

  async handleCron1MinIndex() {
    // 取数时间段 9:32～11:31 || 13:01~15:01 因为32分才能取到第31分的数据，30分的数据无效
    this.taskService.addCronJob('callIndex1Mins', '*/1 * * * *', async () => {
      const time = new Date();
      if (!this.timezoneService.isInTime1Min(time)) return;
      return await this.dataService.cronIndex({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.One,
        time: time,
      });
    });
  }

  async handleCron5MinIndex() {
    // 取数时间段 9:36～11:31 || 13:06~15:01
    this.taskService.addCronJob('callIndex5Mins', '1/5 * * * *', async () => {
      const time = new Date();
      if (!this.timezoneService.isInTime5Min(time)) return;
      return await this.dataService.cronIndex({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.FIVE,
        time: time,
      });
    });
  }

  async handleCron15MinIndex() {
    // 取数时间段 9:46～11:31 || 13:16~15:01
    this.taskService.addCronJob('callIndex15Mins', '1/15 * * * *', async () => {
      const time = new Date();
      if (!this.timezoneService.isInTime15Min(time)) return;
      return await this.dataService.cronIndex({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.FIFTEEN,
        time: time,
      });
    });
  }

  async handleCron30MinIndex() {
    // 取数时间段 10:01～11:31 || 13:31~15:01
    this.taskService.addCronJob('callIndex30Mins', '1/30 * * * *', async () => {
      const time = new Date();
      if (!this.timezoneService.isInTime30Min(time)) return;
      return await this.dataService.cronIndex({
        symbol: DataController.symbol,
        periodType: IndexPeriodType.THIRTY,
        time: time,
      });
    });
  }

  async handleCron60MinIndex() {
    // 取数时间段 10:31～11:31 || 14:01~15:01
    const task = async () => {
      const time = new Date();
      return await this.dataService.cronIndex({
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
}
