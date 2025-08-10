import { IsNotEmpty } from 'class-validator';
import { AgentState } from '@langchain/langgraph/prebuilt';

export class ApplyTemplateDto {
  @IsNotEmpty({
    message: '模版名称不能为空',
  })
  name: string;

  state: AgentState;
}
