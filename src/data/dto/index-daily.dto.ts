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
    message: '开始日期不能为空, 格式19900101',
  })
  startDate: string;

  @IsNotEmpty({
    message: '结束日期不能为空, 格式20500101',
  })
  endDate: string;
}
