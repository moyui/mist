import { IsNotEmpty } from 'class-validator';

export class RunDualMADto {
  @IsNotEmpty({
    message: '收盘价不能为空',
  })
  close: number[];

  shortPeriod?: number;

  longPeriod?: number;
}
