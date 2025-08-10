import { Injectable } from '@nestjs/common';
import { State } from './dto/state.dto';

@Injectable()
export class RoleService {
  Commander(state: State) {
    // 1. 接收用户指令/目标
    const messages = apply_prompt_template('coordinator', state);

    return state;
  }

  DataEngineer() {}

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
