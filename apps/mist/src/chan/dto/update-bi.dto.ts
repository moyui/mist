import { IsNotEmpty, Matches } from 'class-validator';
import { BEIJING_DATE_REGEX } from '@app/timezone';

export class UpdateBiDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol!: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code!: string;

  @IsNotEmpty({
    message: '开始时间不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '开始时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  startDate!: string;

  @IsNotEmpty({
    message: '结束时间不能为空',
  })
  @Matches(BEIJING_DATE_REGEX, {
    message: '结束时间格式必须是 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS',
  })
  endDate!: string;

  period!: number;
}
