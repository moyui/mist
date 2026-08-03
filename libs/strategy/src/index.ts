export { KPriceProjector } from './market-data/k-price-projector';
export type { StrategyPriceInput } from './market-data/k-price-projector';
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
} from './market-data/strategy-bar';
export type {
  StrategyMarketDataPort,
  StrategyMarketObservation,
  StrategyRealtimeMarketDataPort,
  StrategyRealtimeWindow,
  StrategyRealtimeWindowCriteria,
  StrategyReplayMarketDataPort,
  StrategyReplayPage,
  StrategyReplayPageCriteria,
  StrategyTrigger,
} from './market-data/strategy-market-data.port';
