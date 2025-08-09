import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ConfigService } from '@nestjs/config';
import type { AngentsConfig } from '@app/config';

@Injectable()
export class AgentsService {
  constructor(
    private llmService: LlmService,
    private configService: ConfigService,
  ) {}

  // todo 这些是需要用tool function的调用
  getCommanderAgent(): ReturnType<typeof createReactAgent> {
    const agentsConfig = this.configService.get<AngentsConfig>('agents');

    return createReactAgent({
      llm: this.llmService.getLLMByType(agentsConfig['Commander']),
      tools: [],
      prompt: '',
    });
  }
}
