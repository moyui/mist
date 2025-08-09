import { Injectable } from '@nestjs/common';
import { State } from './dto/state.dto';

@Injectable()
export class RoleService {
  Commander(state: State) {
    return state;
  }

  DataEngineer() {}

  Strategist() {}

  PatternFinder() {}

  SentimentAnalyst() {}

  Reporter() {}

  RiskMonitor() {}
}
