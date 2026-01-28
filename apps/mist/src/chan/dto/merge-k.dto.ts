import { IsNotEmpty } from 'class-validator';
import { KVo } from '../../indicator/vo/k.vo';

export class MergeKDto {
  @IsNotEmpty({
    message: 'K线数据不能为空',
  })
  k: KVo[];
}
