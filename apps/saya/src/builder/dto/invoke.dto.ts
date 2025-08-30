import { IsNotEmpty } from 'class-validator';

export class InvokeDto {
  @IsNotEmpty({
    message: '消息不能为空',
  })
  message: string;
}
