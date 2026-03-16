import { AngentsConfig } from '@app/config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { TemplateService } from '../template/template.service';
import { StateAnnotation } from './dto/state.dto';

@Injectable()
export class RoleService {
  constructor(
    private readonly templateService: TemplateService,
    private readonly llmService: LlmService,
    private readonly configService: ConfigService,
  ) {}

  Planner = async (state: typeof StateAnnotation.State) => {
    await this.templateService.applyPromptTemplate({
      name: 'Planner',
      state,
    });
  };

  Commander = async (state: typeof StateAnnotation.State) => {
    await this.templateService.applyPromptTemplate({
      name: 'Commander',
      state,
    });
    const agentsConfig = this.configService.get<AngentsConfig>('agents');
    if (agentsConfig) {
      this.llmService.getLLMByType(agentsConfig['Commander']);
    }

    // TODO: Uncomment when Router is ready
    // const response = await llm.withStructuredOutput(Router).invoke(messages);
    // let goto = response['next'];
    // if (goto === 'FINISH') {
    //   goto = '__end__';
    // }
    // return new Command({
    //   goto,
    //   update: { next: goto },
    // });
  };

  DataEngineer = async (state: typeof StateAnnotation.State) => {
    await this.templateService.applyPromptTemplate({
      name: 'DataEngineer',
      state,
    });
  };

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
