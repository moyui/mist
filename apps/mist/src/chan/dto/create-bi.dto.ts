import { IsNotEmpty } from 'class-validator';
import { KVo } from '../../indicator/vo/k.vo';

export class CreateBiDto {
  @IsNotEmpty({
    message: 'K线数据不能为空',
  })
  k: KVo[];
}
