import { registerAs } from '@nestjs/config';

export enum LlmType {
  Basic = 'basic',
  Reasoning = 'reasoning',
  Version = 'version',
}

export interface AngentsConfig {
  Commander: LlmType;
  DataEngineer: LlmType;
  Strategist: LlmType;
  PatternFinder: LlmType;
  SentimentAnalyst: LlmType;
  Reporter: LlmType;
  RiskMonitor: LlmType;
}

export const agentsConfig = registerAs(
  'agents',
  (): AngentsConfig => ({
    Commander: LlmType.Reasoning,
    DataEngineer: LlmType.Basic,
    Strategist: LlmType.Basic,
    PatternFinder: LlmType.Basic,
    SentimentAnalyst: LlmType.Version,
    Reporter: LlmType.Basic,
    RiskMonitor: LlmType.Basic,
  }),
);
