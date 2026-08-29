export { KPriceProjector } from '@app/market-data';
export type { StrategyPriceInput } from '@app/market-data';
export {
  STRATEGY_KDJ_CALCULATION_BAR_COUNT,
  calculateStrategyKdj,
} from './analysis/strategy-kdj';
export type { StrategyKdjObservation } from './analysis/strategy-kdj';
export {
  STRATEGY_MACD_CALCULATION_BAR_COUNT,
  calculateStrategyMacd,
} from './analysis/strategy-macd';
export type { StrategyMacdObservation } from './analysis/strategy-macd';
export type {
  StrategyBar,
  StrategyBarType,
  StrategyMarketSource,
  StrategyRealtimeSource,
} from '@app/market-data';
export type {
  StrategyMarketDataPort,
  StrategyMarketObservation,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeWindow,
  StrategyRealtimeWindowCriteria,
  StrategyReplayMarketDataPort,
  StrategyReplayPage,
  StrategyReplayPageCriteria,
  StrategyReplayWindow,
  StrategyReplayWindowCriteria,
  StrategyTrigger,
} from '@app/market-data';
export {
  STRATEGY_FIELD_CATALOG,
  STRATEGY_FIELD_PATHS,
} from './rules/strategy-field.catalog';
export type {
  StrategyFieldCatalogEntry,
  StrategyFieldPath,
  StrategyFieldValueType,
} from './rules/strategy-field.catalog';
export {
  MAX_STRATEGY_RULE_CONDITIONS,
  MAX_STRATEGY_RULE_DEPTH,
  compileStrategyRuleForCreate,
  compileStoredStrategyRule,
} from './rules/strategy-rule.compiler';
export type {
  CompiledStrategyCondition,
  CompiledStrategyExecutionPlan,
  CompiledStrategyExpression,
  CompiledStrategyGroup,
  StrategyRuleCompilation,
  StrategyRuleCondition,
  StrategyRuleExpression,
  StrategyRuleGroup,
  StrategyRuleOperator,
  StrategySignalKind,
} from './rules/strategy-rule.types';
export { imputeSeries, StrategySeriesImputer } from '@app/market-data';
export type {
  ProjectedStrategyBar,
  ProjectedStrategyOhlc,
  ProjectedStrategyQuantity,
  StrategyImputationResolution,
  StrategyOhlcTuple,
} from '@app/market-data';
export { buildStrategyEvaluationContext } from './evaluation/strategy-context.builder';
export type { StrategyContextBuildResult } from './evaluation/strategy-context.builder';
export { serializeStrategyContextSnapshot } from './evaluation/strategy-context-snapshot.serializer';
export { StrategyAnalysisObservationCache } from './evaluation/strategy-context.builder';
export { compileStoredStrategyRuleWithNormalized } from './rules/strategy-rule.compiler';
export { evaluateStrategyPlan } from './evaluation/strategy-rule.evaluator';
export type {
  StrategyEvaluationContext,
  StrategyEvaluationOutcome,
  StrategyEvaluationResult,
  StrategyFieldObservation,
  StrategyQuantityEvidence,
  StrategyQuantityEvidenceItem,
  StrategyQuantityEvidenceObservation,
  StrategyUnavailableReason,
} from './evaluation/strategy-evaluation.types';
