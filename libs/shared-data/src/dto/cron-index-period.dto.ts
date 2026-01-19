import { IsNotEmpty } from 'class-validator';
import { Type as IndexPeriodType } from '../../../../../libs/shared-data/src/entities/index-period.entity';

export class CronIndexPeriodDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '时间类型不能为空',
  })
  periodType: IndexPeriodType;

  @IsNotEmpty({
    message: '当前时间不能为空',
  })
  time: Date;
}
