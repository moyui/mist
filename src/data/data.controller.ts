import { Controller, Get, Inject } from '@nestjs/common';
import { TaskService } from 'src/task/task.service';
import { TimezoneService } from 'src/timezone/timezone.service';
import { DataService } from './data.service';
import { Type as IndexPeriodType } from './entities/index-period.entity';
@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {
    // 初始化上证指数
    this.dataService.initData();
  }

  private static symbol = '000001';

  @Inject()
  private taskService: TaskService;

  @Inject()
  private timezoneService: TimezoneService;

  @Get('FiveMinIndex')
  async handleCron5MinIndex() {
    this.taskService.addCronJob('callIndex5Mins', '*/5 * * * *', async () => {
      // 计算当前时间
      const localTime = new Date(); // 假设当前时间是伦敦时间

      const beijingTime5Minutes =
        this.timezoneService.convertToBeijingTimeWithInterval(
          localTime,
          'Europe/London', // from时间
          5,
        );

      const data = await this.dataService.getIndex({
        symbol: DataController.symbol,
        period: IndexPeriodType.FIVE,
        startDate: beijingTime5Minutes,
        endDate: beijingTime5Minutes,
      });
      const result = await this.dataService.saveData(
        {
          symbol: DataController.symbol,
          time: beijingTime5Minutes,
        },
        data,
        IndexPeriodType.FIVE,
      );
      return result;
    });
  }
}
