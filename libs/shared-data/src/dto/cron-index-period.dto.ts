import { IsNotEmpty } from 'class-validator';
import { Period } from '@app/shared-data';

export class CronIndexPeriodDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol!: string;

  @IsNotEmpty({
    message: '时间类型不能为空',
  })
  periodType!: Period;

  @IsNotEmpty({
    message: '当前时间不能为空',
  })
  time!: Date;
}
