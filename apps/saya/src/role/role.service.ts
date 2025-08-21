import { Injectable } from '@nestjs/common';
import { TemplateService } from '../template/template.service';
import { State } from './dto/state.dto';

@Injectable()
export class RoleService {
  constructor(private templateService: TemplateService) {}

  Commander(state: State) {
    // 1. 接收用户指令/目标
    const messages = this.templateService.applyPromptTemplate({
      name: 'commander',
      state,
    });
    return state;
  }

  DataEngineer() {}

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
