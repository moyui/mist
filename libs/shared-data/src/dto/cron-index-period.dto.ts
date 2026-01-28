import { IsNotEmpty } from 'class-validator';
import { PeriodType } from '@app/shared-data';

export class CronIndexPeriodDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '时间类型不能为空',
  })
  periodType: PeriodType;

  @IsNotEmpty({
    message: '当前时间不能为空',
  })
  time: Date;
}
