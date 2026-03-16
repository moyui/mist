import type { AngentsConfig } from '@app/config';
import { LlmType } from '@app/config';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { ToolsService } from '../tools/tools.service';

@Injectable()
export class AgentsService {
  constructor(
    private readonly llmService: LlmService,
    private readonly toolsService: ToolsService,
    private readonly configService: ConfigService,
  ) {}

  // todo 这些是需要用tool function的调用
  getCommanderAgent(): ReturnType<typeof createReactAgent> {
    const agentsConfig = this.configService.get<AngentsConfig>('agents');
    const llmType = agentsConfig?.['Commander'] || LlmType.Basic;

    const llm = this.llmService.getLLMByType(llmType);

    return createReactAgent({
      llm: llm!,
      tools: [],
      prompt: '',
    });
  }
}
