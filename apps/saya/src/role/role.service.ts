import { AngentsConfig } from '@app/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { TemplateService } from '../template/template.service';
import { State } from './dto/state.dto';

@Injectable()
export class RoleService {
  constructor(
    private templateService: TemplateService,
    private llmService: LlmService,
    private configService: ConfigService,
  ) {}

  async Commander(state: State) {
    // 1. 接收用户指令/目标
    const messages = await this.templateService.applyPromptTemplate({
      name: 'commander',
      state,
    });
    const agentsConfig = this.configService.get<AngentsConfig>('agents');
    const llm = this.llmService.getLLMByType(agentsConfig['Commander']);
    const response = await llm.withStructuredOutput({}).invoke(messages);
    const goTo = response['next'];

    return state;
  }

  DataEngineer() {}

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
