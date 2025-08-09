import { IsNotEmpty } from 'class-validator';
import { ChatDeepSeekInput } from '@langchain/deepseek';

export class CronIndexDailyDto {
  @IsNotEmpty({
    message: '指数代码不能为空',
  })
  symbol: string;

  @IsNotEmpty({
    message: '交易所不能为空',
  })
  code: string;

  @IsNotEmpty({
    message: '开始时间不能为空',
  })
  startDate: Date;

  @IsNotEmpty({
    message: '结束时间不能为空',
  })
  endDate: Date;
}

export class CreateDeepSeekLLMDto implements ChatDeepSeekInput {
  @IsNotEmpty({
    message: '模型不能为空',
  })
  model: string;

  temperature?: number;
  baseUrl?: string;
  apiKey?: string;
}
