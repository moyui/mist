import { IsNotEmpty } from 'class-validator';
import { BiVo } from '../vo/bi.vo';

export class CreateChannelDto {
  @IsNotEmpty({
    message: '笔数据不能为空',
  })
  bi: BiVo[];
}
