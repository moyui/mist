import { BarPeriod } from '@app/shared-data';
import { IsBoolean, IsEnum, IsNotEmpty } from 'class-validator';

export class KDJDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code: string;

  @IsEnum(BarPeriod, {
    message:
      '周期只能为1min, 5min, 15min, 30min, 60min, daily，其中 1 分钟数据只能返回当前的, 其余只能返回近期的数据',
  })
  period?: BarPeriod;

  @IsBoolean({
    message: '是否是日线必须是布尔值',
  })
  daily?: boolean;

  @IsNotEmpty({
    message: '开始日期不能为空，格式为13位时间戳',
  })
  startDate: number;

  @IsNotEmpty({
    message: '结束日期不能为空，格式为13位时间戳',
  })
  endDate: number;
}
