import { IsNotEmpty } from 'class-validator';

export class IndexDailyPriceDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '开始日期不能为空',
  })
  startDate: Date;

  @IsNotEmpty({
    message: '结束日期不能为空',
  })
  endDate: Date;
}
