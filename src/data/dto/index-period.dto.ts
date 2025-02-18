import { IsInt, IsNotEmpty } from 'class-validator';

export class GetIndexPeriodDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '周期不能为空',
  })
  @IsInt({
    message:
      '周期只能为1、5、15、30、60，其中 1 分钟数据只能返回当前的, 其余只能返回近期的数据',
  })
  period: number;

  @IsNotEmpty({
    message: '开始日期不能为空，格式 yyyy-MM-dd HH:mm:ss',
  })
  startDate: string;

  @IsNotEmpty({
    message: '结束日期不能为空，格式 yyyy-MM-dd HH:mm:ss',
  })
  endDate: string;
}
