import {
  Controller,
  Get,
  Inject,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { addMinutes } from 'date-fns';
import { TaskService } from 'src/task/task.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { addZeroToNumber } from 'src/utils';
import { DataService } from './data.service';
import { Type as IndexPeriodType } from './entities/index-period.entity';
import { IndexResponse } from './entities/index-response.entity';
@Controller('data')
export class DataController implements OnApplicationBootstrap {
  private readonly logger = new Logger();
  private static symbol = '000300'; // 上证指数接口有问题，先用hs300代替

  constructor(private readonly dataService: DataService) {
    // 初始化上证指数
    this.dataService.initData();
  }

  onApplicationBootstrap() {
    // 这个函数会在所有模块加载完成后调用
    this.handleCron1MinIndex();
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

  async handleCron1MinIndex() {
    this.taskService.addCronJob('callIndex1Mins', '*/1 * * * *', async () => {
      const localTime = new Date();
      // 模拟9点钟开盘注入数据
      const minutes = addZeroToNumber(localTime.getMinutes());
      const seconds = addZeroToNumber(localTime.getSeconds());
      // 假设当前时间
      const realTime = new Date(`2025-02-14T10:${minutes}:${seconds}`);

      // 启动脚本
      // 这里有单独的逻辑，如果是9点31分的第一根k线，则需要合并30分和31分的数据， 这个时间理论上应该要从32分开始算是准确的
      // 反之就取第二位的数据
      const timeStart = this.timezoneService.convertToBeijingTimeWithInterval(
        addMinutes(realTime, -1),
        'Asia/Shanghai', // from时间
        1,
      );

      const timeEnd = this.timezoneService.convertToBeijingTimeWithInterval(
        realTime,
        'Asia/Shanghai', // from时间
        1,
      );

      const data = await this.dataService.getIndex({
        symbol: DataController.symbol,
        period: IndexPeriodType.One,
        startDate: timeStart.format,
        endDate: timeEnd.format,
      });

      let saveData: IndexResponse = {} as IndexResponse;
      if (timeEnd.date.getHours() === 9 && timeEnd.date.getMinutes() === 31) {
        saveData = {
          时间: data[1]['时间'],
          开盘: data[0]['开盘'],
          收盘: data[1]['收盘'],
          最高: Math.max(data[0]['最高'], data[1]['最高']),
          最低: Math.max(data[0]['最低'], data[1]['最低']),
          成交量: data[0]['成交量'] + data[1]['成交量'],
          成交额: data[1]['成交额'] + data[1]['成交额'],
        };
      } else {
        saveData = data[0];
      }
      this.logger.debug(
        `${JSON.stringify(saveData)}  启动时间：${timeStart.format} - 结束时间：${timeEnd.format}`,
        DataController,
      );
      const result = await this.dataService.saveData(
        {
          symbol: DataController.symbol,
          time: timeStart.format,
        },
        saveData,
        IndexPeriodType.One,
      );
      this.logger.debug(
        `${result} - 启动时间：${timeStart.format} - 结束时间：${timeEnd.format}`,
        DataController,
      );
    });
  }
}
