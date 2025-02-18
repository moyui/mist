import { IsNotEmpty } from 'class-validator';

export class SaveIndexPeriodDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '时间不能为空',
  })
  time: Date;
}
