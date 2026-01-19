import { PeriodType } from '@app/shared-data';
import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator';

export class RSIDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code: string;

  @IsInt({
    message:
      '周期只能为1、5、15、30、60，其中 1 分钟数据只能返回当前的, 其余只能返回近期的数据',
  })
  period?: PeriodType;

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
