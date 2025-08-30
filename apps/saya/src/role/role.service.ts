import { AngentsConfig } from '@app/config';
import { Command } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { TemplateService } from '../template/template.service';
import { Router } from './dto/router.dto';
import { StateAnnotation } from './dto/state.dto';

@Injectable()
export class RoleService {
  @Inject()
  private templateService: TemplateService;

  @Inject()
  private llmService: LlmService;

  @Inject()
  private configService: ConfigService;

  async Commander(state: typeof StateAnnotation.State) {
    const messages = await this.templateService.applyPromptTemplate({
      name: 'Commander',
      state,
    });
    const agentsConfig = this.configService.get<AngentsConfig>('agents');
    const llm = this.llmService.getLLMByType(agentsConfig['Commander']);
    const response = await llm.withStructuredOutput(Router).invoke(messages);
    let goto = response['next'];
    if (goto === 'FINISH') {
      goto = '__end__';
    }
    return new Command({
      goto,
      update: { next: goto },
    });
  }

  async DataEngineer() {}

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
