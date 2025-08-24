import { IsNotEmpty } from 'class-validator';

export class LocalServiceDto<T> {
  @IsNotEmpty({
    message: 'url不能为空',
  })
  url: string;

  params?: T;
}
