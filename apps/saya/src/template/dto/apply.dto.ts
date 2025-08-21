import { IsNotEmpty } from 'class-validator';
import { State } from '../../role/dto/state.dto';

export class ApplyTemplateDto {
  @IsNotEmpty({
    message: '模版名称不能为空',
  })
  name: string;

  state: State;
}
