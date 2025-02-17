import { IsNotEmpty } from 'class-validator';

export class CronIndexDailyDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code: string;

  @IsNotEmpty({
    message: '开始时间不能为空',
  })
  startDate: string;

  @IsNotEmpty({
    message: '结束时间不能为空',
  })
  endDate: string;
}
