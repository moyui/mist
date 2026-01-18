import { IsNotEmpty } from 'class-validator';

export class RunATRDto {
  @IsNotEmpty({
    message: '最高价不能为空',
  })
  high: number[];

  @IsNotEmpty({
    message: '最低价不能为空',
  })
  low: number[];

  @IsNotEmpty({
    message: '收盘价不能为空',
  })
  close: number[];

  period?: number; // 周期
}
