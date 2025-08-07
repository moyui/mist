import { IsNotEmpty } from 'class-validator';

export class IndexDailyDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code: string;

  @IsNotEmpty({
    message: '开始日期不能为空',
  })
  startDate: Date;

  @IsNotEmpty({
    message: '结束日期不能为空',
  })
  endDate: Date;
}
